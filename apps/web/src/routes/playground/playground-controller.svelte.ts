import type {
	FileSystemTree,
	WebContainer as WebContainerInstance,
	WebContainerProcess
} from '@webcontainer/api';
import { SvelteURL } from 'svelte/reactivity';
import monacoEditorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker?worker&url';
import monacoCssWorkerUrl from 'monaco-editor/esm/vs/language/css/css.worker?worker&url';
import monacoHtmlWorkerUrl from 'monaco-editor/esm/vs/language/html/html.worker?worker&url';
import monacoJsonWorkerUrl from 'monaco-editor/esm/vs/language/json/json.worker?worker&url';
import monacoTsWorkerUrl from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&url';
import {
	getPlaygroundDemoById,
	playgroundDemos,
	resolvePlaygroundDemoId
} from './playground-demos';

type MonacoModule = typeof import('monaco-editor');
type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type MonacoDisposable = import('monaco-editor').IDisposable;
type MonacoModel = import('monaco-editor').editor.ITextModel;
type MonacoWorkerConstructor = new () => Worker;
type ShikiHighlighter = Awaited<ReturnType<(typeof import('shiki'))['createHighlighter']>>;
type FontReadyDocument = Document & { fonts?: { ready: Promise<unknown> } };
type FileTreeNode =
	| { kind: 'directory'; name: string; path: string; children: FileTreeNode[] }
	| { kind: 'file'; name: string; path: string };
type FileTreeRow = {
	kind: 'directory' | 'file';
	name: string;
	path: string;
	depth: number;
};

let sharedShikiHighlighter: ShikiHighlighter | null = null;
let isShikiMonacoConfigured = false;

export const createPlaygroundController = (initialDemoId?: string | null) => {
	let webcontainer: WebContainerInstance | null = null;
	let devProcess: WebContainerProcess | null = null;
	let editorHost: HTMLDivElement | null = null;
	let editorInstance: MonacoEditor | null = null;
	let editorChangeSubscription: MonacoDisposable | null = null;
	let shikiHighlighter: ShikiHighlighter | null = null;
	let previewUrl = $state('');
	let previewReloadToken = $state(0);
	let errorMessage = $state('');
	let syncError = $state('');
	let runtimeLog = $state('');
	let status = $state('Booting...');
	let isSyncing = $state(false);
	let syncingPath = $state('');
	let syncTimer: ReturnType<typeof setTimeout> | null = null;
	const initialResolvedDemoId = resolvePlaygroundDemoId(initialDemoId);
	let activeDemoId = $state(initialResolvedDemoId);
	let activeFilePath = $state('src/App.svelte');
	let openFilePaths = $state<string[]>(['src/App.svelte']);
	let collapsedDirs = $state<Record<string, boolean>>({ 'packages/motion-gpu/dist': true });
	const maxOpenTabs = 3;
	let isBootingRuntime = false;
	let isStartingDevServer = false;
	let hiddenStartedAt = 0;
	let isResumeRecoveryRunning = false;

	let monacoApi: MonacoModule | null = null;
	const monacoModelsByPath: Record<string, MonacoModel> = {};
	const dirtyPaths: string[] = [];
	let isSyncFlushRunning = false;

	const isolationReloadStorageKey = 'motiongpu-playground-isolation-reload';
	const longHiddenThresholdMs = 45_000;
	const runtimeHealthcheckTimeoutMs = 3_500;
	const installTimeoutMs = 180_000;
	const editorFontStack =
		'"Aeonik Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
	const runtimeTemplateRawModules = import.meta.glob('./runtime-template/**/*', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>;
	const runtimeTemplateFiles = Object.fromEntries(
		Object.entries(runtimeTemplateRawModules)
			.map(([path, source]) => {
				const marker = '/runtime-template/';
				const markerIndex = path.lastIndexOf(marker);
				if (markerIndex === -1) return null;
				const relativePath = path.slice(markerIndex + marker.length);
				return [relativePath, source] as const;
			})
			.filter((entry): entry is readonly [string, string] => entry !== null)
	);
	const packageLockContent = runtimeTemplateFiles['package-lock.json'] ?? '';
	const motionGpuPackageJsonRaw = String(
		import.meta.glob('../../../../../packages/motion-gpu/package.json', {
			query: '?raw',
			import: 'default',
			eager: true
		})['../../../../../packages/motion-gpu/package.json'] ?? ''
	);
	const motionGpuPackageJson = (() => {
		try {
			const parsed = JSON.parse(motionGpuPackageJsonRaw) as {
				name?: string;
				version?: string;
				type?: string;
				svelte?: string;
				types?: string;
				exports?: unknown;
				peerDependencies?: Record<string, string>;
			};

			return JSON.stringify(
				{
					name: parsed.name ?? '@motion-core/motion-gpu',
					version: parsed.version ?? '0.1.0',
					type: parsed.type ?? 'module',
					svelte: parsed.svelte ?? './dist/index.js',
					types: parsed.types ?? './dist/index.d.ts',
					exports: parsed.exports ?? {
						'.': {
							types: './dist/index.d.ts',
							svelte: './dist/index.js',
							default: './dist/index.js'
						}
					},
					peerDependencies: parsed.peerDependencies ?? {
						svelte: '^5.0.0'
					}
				},
				null,
				2
			);
		} catch {
			return JSON.stringify(
				{
					name: '@motion-core/motion-gpu',
					version: '0.1.0',
					type: 'module',
					svelte: './dist/index.js',
					types: './dist/index.d.ts',
					exports: {
						'.': {
							types: './dist/index.d.ts',
							svelte: './dist/index.js',
							default: './dist/index.js'
						}
					},
					peerDependencies: {
						svelte: '^5.0.0'
					}
				},
				null,
				2
			);
		}
	})();
	const motionGpuDistRawModules = import.meta.glob(
		'../../../../../packages/motion-gpu/dist/**/*.{js,svelte,d.ts}',
		{ query: '?raw', import: 'default', eager: true }
	) as Record<string, string>;
	const motionGpuDistFiles = Object.fromEntries(
		Object.entries(motionGpuDistRawModules)
			.map(([path, source]) => {
				const marker = '/packages/motion-gpu/dist/';
				const markerIndex = path.lastIndexOf(marker);
				if (markerIndex === -1) return null;
				const relativePath = path.slice(markerIndex + marker.length);
				return [relativePath, source] as const;
			})
			.filter((entry): entry is readonly [string, string] => entry !== null)
	);

	type WebContainerNode =
		| { file: { contents: string } }
		| { directory: Record<string, WebContainerNode> };
	const buildDirectoryTree = (
		flatFiles: Record<string, string>
	): Record<string, WebContainerNode> => {
		const root: Record<string, WebContainerNode> = {};

		for (const [filePath, contents] of Object.entries(flatFiles)) {
			const segments = filePath.split('/').filter(Boolean);
			if (segments.length === 0) continue;

			let cursor = root;
			for (let index = 0; index < segments.length; index += 1) {
				const segment = segments[index]!;
				const isLast = index === segments.length - 1;

				if (isLast) {
					cursor[segment] = { file: { contents } };
					break;
				}

				const existingNode = cursor[segment];
				if (!existingNode || !('directory' in existingNode)) {
					cursor[segment] = { directory: {} };
				}
				cursor = (cursor[segment] as { directory: Record<string, WebContainerNode> }).directory;
			}
		}

		return root;
	};

	const baseWorkerFiles: Record<string, string> = {
		...runtimeTemplateFiles,
		'packages/motion-gpu/package.json': motionGpuPackageJson,
		...Object.fromEntries(
			Object.entries(motionGpuDistFiles).map(([path, contents]) => [
				`packages/motion-gpu/dist/${path}`,
				contents
			])
		)
	};
	const demoAppPath = 'src/App.svelte';
	const demoRuntimePath = 'src/runtime.svelte';
	const toWorkerFilesForDemo = (demoId: string) => {
		const resolvedDemoId = resolvePlaygroundDemoId(demoId);
		const demo = getPlaygroundDemoById(resolvedDemoId);
		if (!demo) {
			return { ...baseWorkerFiles };
		}
		const workerFiles: Record<string, string> = {
			...baseWorkerFiles,
			[demoAppPath]: demo.appSource
		};
		if (typeof demo.runtimeSource === 'string') {
			workerFiles[demoRuntimePath] = demo.runtimeSource;
		}
		return workerFiles;
	};

	const initialDemoFiles = toWorkerFilesForDemo(initialResolvedDemoId);
	let fileContents = $state<Record<string, string>>(initialDemoFiles);
	let filePaths = $state<string[]>(Object.keys(initialDemoFiles));

	const collectTreeRows = (
		nodes: FileTreeNode[],
		collapsed: Record<string, boolean>,
		depth = 0
	): FileTreeRow[] => {
		const rows: FileTreeRow[] = [];

		for (const node of nodes) {
			rows.push({ kind: node.kind, name: node.name, path: node.path, depth });
			if (node.kind === 'directory' && !collapsed[node.path]) {
				rows.push(...collectTreeRows(node.children, collapsed, depth + 1));
			}
		}

		return rows;
	};

	const buildFileTree = (paths: string[]): FileTreeNode[] => {
		type MutableNode = {
			kind: 'directory' | 'file';
			name: string;
			path: string;
			children?: Record<string, MutableNode>;
		};

		const rootChildren: Record<string, MutableNode> = {};
		const getDirectoryNode = (children: Record<string, MutableNode>, key: string, path: string) => {
			const existing = children[key];
			if (existing && existing.kind === 'directory') {
				return existing;
			}

			const created: MutableNode = {
				kind: 'directory',
				name: key,
				path,
				children: {}
			};
			children[key] = created;
			return created;
		};

		for (const filePath of paths) {
			const segments = filePath.split('/').filter(Boolean);
			if (segments.length === 0) continue;

			let cursor: Record<string, MutableNode> = rootChildren;
			let currentPath = '';

			for (let index = 0; index < segments.length; index += 1) {
				const segment = segments[index]!;
				currentPath = currentPath ? `${currentPath}/${segment}` : segment;
				const isLast = index === segments.length - 1;

				if (isLast) {
					cursor[segment] = { kind: 'file', name: segment, path: currentPath };
					continue;
				}

				const directoryNode = getDirectoryNode(cursor, segment, currentPath);
				cursor = directoryNode.children as Record<string, MutableNode>;
			}
		}

		const toReadonlyNodes = (children: Record<string, MutableNode>): FileTreeNode[] =>
			Object.values(children)
				.sort((left, right) => {
					if (left.kind !== right.kind) {
						return left.kind === 'directory' ? -1 : 1;
					}
					return left.name.localeCompare(right.name);
				})
				.map((node) => {
					if (node.kind === 'file') {
						return { kind: 'file', name: node.name, path: node.path };
					}

					return {
						kind: 'directory',
						name: node.name,
						path: node.path,
						children: toReadonlyNodes(node.children as Record<string, MutableNode>)
					};
				});

		return toReadonlyNodes(rootChildren);
	};

	const fileTree = $derived(buildFileTree(filePaths));
	const visibleFileTreeRows = $derived(collectTreeRows(fileTree, collapsedDirs));
	const getLanguageFromPath = (filePath: string) => {
		if (filePath.endsWith('.svelte')) return 'svelte';
		if (filePath.endsWith('.ts')) return 'typescript';
		if (filePath.endsWith('.d.ts')) return 'typescript';
		if (filePath.endsWith('.js')) return 'javascript';
		if (filePath.endsWith('.json')) return 'json';
		if (filePath.endsWith('.html')) return 'html';
		if (filePath.endsWith('.css')) return 'css';
		return 'plaintext';
	};

	const createRuntimeFileTree = (flatFiles: Record<string, string>): FileSystemTree =>
		buildDirectoryTree(flatFiles) as FileSystemTree;
	const ESC = String.fromCharCode(27);
	const BEL = String.fromCharCode(7);

	const stripAnsi = (value: string) =>
		value
			// Remove CSI sequences (colors, cursor movement, clear line, etc.).
			.replace(new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
			// Remove OSC sequences (for terminal hyperlinks/window titles).
			.replace(new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g'), '')
			// Remove single-character ESC control sequences (for example "ESC c" reset).
			.replace(new RegExp(`${ESC}[@-Z\\\\-_]`, 'g'), '');

	const normalizeLogChunk = (chunk: string) =>
		stripAnsi(
			chunk
				// Normalize Windows newlines first.
				.replace(/\r\n/g, '\n')
				// Drop standalone carriage returns used for in-place terminal updates.
				.replace(/\r/g, '')
		);

	const compactLogForDisplay = (value: string) =>
		value
			// Keep at most one empty line between log blocks.
			.replace(/\n{3,}/g, '\n\n')
			// Remove leading whitespace-only lines caused by screen clearing.
			.replace(/^(?:[ \t]*\n)+/, '')
			// Trim trailing spaces on each line.
			.replace(/[ \t]+\n/g, '\n');

	const runtimeLogTail = $derived(
		compactLogForDisplay(runtimeLog).split('\n').slice(-120).join('\n')
	);

	const appendLog = (chunk: string) => {
		const cleanChunk = normalizeLogChunk(chunk);
		runtimeLog = (runtimeLog + cleanChunk).slice(-50000);
	};

	const extractLastNpmDebugLogPath = (value: string) => {
		const cleanValue = stripAnsi(value);
		const matches = Array.from(
			cleanValue.matchAll(/A complete log of this run can be found in:\s*(.+)/g)
		);
		return matches.at(-1)?.[1]?.trim() ?? '';
	};

	const streamProcessOutput = (process: WebContainerProcess) => {
		void process.output
			.pipeTo(
				new WritableStream({
					write(chunk) {
						appendLog(chunk);
					}
				})
			)
			.catch(() => {});
	};

	const getPathFromModel = (model: MonacoModel | null) =>
		model ? model.uri.path.replace(/^\/+/, '') : '';

	const ensureMonacoModel = (filePath: string) => {
		if (!monacoApi) return null;

		const existing = monacoModelsByPath[filePath];
		if (existing) return existing;

		const uri = monacoApi.Uri.parse(`file:///${filePath}`);
		const shared = monacoApi.editor.getModel(uri);
		if (shared) {
			monacoModelsByPath[filePath] = shared;
			return shared;
		}

		const model = monacoApi.editor.createModel(
			fileContents[filePath] ?? '',
			getLanguageFromPath(filePath),
			uri
		);
		monacoModelsByPath[filePath] = model;
		return model;
	};
	const disposeMonacoModel = (filePath: string) => {
		const model = monacoModelsByPath[filePath];
		if (!model) return;

		if (editorInstance?.getModel() === model) {
			editorInstance.setModel(null);
		}
		model.dispose();
		delete monacoModelsByPath[filePath];
	};
	const syncModelWithSource = (filePath: string, source: string) => {
		const model = ensureMonacoModel(filePath);
		if (!model) return;
		if (model.getValue() !== source) {
			model.setValue(source);
		}
	};

	const switchToFile = (filePath: string) => {
		if (!(filePath in fileContents)) return;

		activeFilePath = filePath;
		const model = ensureMonacoModel(filePath);
		if (editorInstance && model) {
			editorInstance.setModel(model);
			editorInstance.focus();
		}
	};

	const openFile = (filePath: string) => {
		if (!(filePath in fileContents)) return;
		if (!openFilePaths.includes(filePath)) {
			if (openFilePaths.length >= maxOpenTabs) {
				openFilePaths = [...openFilePaths.slice(0, maxOpenTabs - 1), filePath];
			} else {
				openFilePaths = [...openFilePaths, filePath];
			}
		}
		switchToFile(filePath);
	};

	const closeFile = (filePath: string) => {
		if (!openFilePaths.includes(filePath) || openFilePaths.length <= 1) return;

		const nextOpenPaths = openFilePaths.filter((path) => path !== filePath);
		openFilePaths = nextOpenPaths;

		if (activeFilePath === filePath) {
			const fallbackPath = nextOpenPaths[nextOpenPaths.length - 1] ?? nextOpenPaths[0];
			if (fallbackPath) {
				switchToFile(fallbackPath);
			}
		}
	};

	const toggleDirectory = (path: string) => {
		collapsedDirs = { ...collapsedDirs, [path]: !collapsedDirs[path] };
	};

	const flushQueuedSyncs = async () => {
		if (isSyncFlushRunning || !webcontainer || dirtyPaths.length === 0) {
			return;
		}

		isSyncFlushRunning = true;
		isSyncing = true;
		syncError = '';

		try {
			while (webcontainer && dirtyPaths.length > 0) {
				const filePath = dirtyPaths[0]!;
				syncingPath = filePath;
				await webcontainer.fs.writeFile(filePath, fileContents[filePath] ?? '');
				dirtyPaths.shift();
			}
		} catch (error) {
			const failedPath = dirtyPaths[0] ?? '';
			syncError =
				error instanceof Error
					? error.message
					: failedPath
						? `Could not sync ${failedPath} to preview.`
						: 'Could not sync changes to preview.';
		} finally {
			isSyncing = false;
			syncingPath = '';
			isSyncFlushRunning = false;
			if (webcontainer && dirtyPaths.length > 0) {
				scheduleSyncFlush();
			}
		}
	};

	const scheduleSyncFlush = () => {
		if (!webcontainer) {
			return;
		}

		if (syncTimer) {
			clearTimeout(syncTimer);
		}
		syncTimer = setTimeout(() => {
			syncTimer = null;
			void flushQueuedSyncs();
		}, 220);
	};

	const queueSync = (filePath: string) => {
		if (!dirtyPaths.includes(filePath)) {
			dirtyPaths.push(filePath);
		}
		scheduleSyncFlush();
	};
	const removeDirtyPath = (filePath: string) => {
		const nextDirtyPaths = dirtyPaths.filter((path) => path !== filePath);
		dirtyPaths.length = 0;
		dirtyPaths.push(...nextDirtyPaths);
	};
	const switchDemo = (nextDemoId: string | null | undefined) => {
		const resolvedDemoId = resolvePlaygroundDemoId(nextDemoId);
		if (resolvedDemoId === activeDemoId) return;

		const demo = getPlaygroundDemoById(resolvedDemoId);
		if (!demo) return;

		activeDemoId = resolvedDemoId;
		errorMessage = '';
		syncError = '';

		const nextFileContents: Record<string, string> = {
			...fileContents,
			[demoAppPath]: demo.appSource
		};

		if (typeof demo.runtimeSource === 'string') {
			nextFileContents[demoRuntimePath] = demo.runtimeSource;
		} else {
			delete nextFileContents[demoRuntimePath];
		}

		fileContents = nextFileContents;
		filePaths = Object.keys(nextFileContents);
		openFilePaths = [demoAppPath];
		activeFilePath = demoAppPath;

		syncModelWithSource(demoAppPath, demo.appSource);
		if (typeof demo.runtimeSource === 'string') {
			syncModelWithSource(demoRuntimePath, demo.runtimeSource);
			queueSync(demoRuntimePath);
		} else {
			removeDirtyPath(demoRuntimePath);
			disposeMonacoModel(demoRuntimePath);
			if (webcontainer) {
				void webcontainer.fs.rm(demoRuntimePath).catch(() => {});
			}
		}

		queueSync(demoAppPath);
		switchToFile(demoAppPath);
		status = `Switched demo: ${demo.name}`;
	};

	const queueOpenFileSyncs = () => {
		for (const filePath of openFilePaths) {
			if (!(filePath in fileContents)) continue;
			if (!dirtyPaths.includes(filePath)) {
				dirtyPaths.push(filePath);
			}
		}
		scheduleSyncFlush();
	};

	const registerSvelteLanguage = (monaco: MonacoModule) => {
		if (monaco.languages.getLanguages().some((language) => language.id === 'svelte')) {
			return;
		}

		monaco.languages.register({
			id: 'svelte',
			extensions: ['.svelte'],
			aliases: ['Svelte', 'svelte'],
			mimetypes: ['text/x-svelte']
		});

		monaco.languages.setLanguageConfiguration('svelte', {
			comments: { blockComment: ['<!--', '-->'] },
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')'],
				['<', '>']
			],
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"' },
				{ open: "'", close: "'" },
				{ open: '`', close: '`' }
			],
			surroundingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"' },
				{ open: "'", close: "'" },
				{ open: '`', close: '`' }
			]
		});
	};

	const getMonacoWorkerUrlByLabel = (label: string) => {
		if (label === 'json') return monacoJsonWorkerUrl;
		if (label === 'css' || label === 'scss' || label === 'less') return monacoCssWorkerUrl;
		if (label === 'html' || label === 'handlebars' || label === 'razor') return monacoHtmlWorkerUrl;
		if (label === 'typescript' || label === 'javascript') return monacoTsWorkerUrl;
		return monacoEditorWorkerUrl;
	};

	const loadMonacoWorkerConstructor = async (label: string): Promise<MonacoWorkerConstructor> => {
		if (label === 'json') {
			const workerModule = await import('monaco-editor/esm/vs/language/json/json.worker?worker');
			return workerModule.default as MonacoWorkerConstructor;
		}
		if (label === 'css' || label === 'scss' || label === 'less') {
			const workerModule = await import('monaco-editor/esm/vs/language/css/css.worker?worker');
			return workerModule.default as MonacoWorkerConstructor;
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			const workerModule = await import('monaco-editor/esm/vs/language/html/html.worker?worker');
			return workerModule.default as MonacoWorkerConstructor;
		}
		if (label === 'typescript' || label === 'javascript') {
			const workerModule =
				await import('monaco-editor/esm/vs/language/typescript/ts.worker?worker');
			return workerModule.default as MonacoWorkerConstructor;
		}
		const workerModule = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
		return workerModule.default as MonacoWorkerConstructor;
	};

	const createMonacoWorker = (WorkerConstructor: MonacoWorkerConstructor, fallbackUrl: string) => {
		try {
			return new WorkerConstructor();
		} catch {
			return new Worker(new SvelteURL(fallbackUrl, window.location.href), { type: 'module' });
		}
	};

	const configureMonacoWorkers = () => {
		const globalAny = globalThis as typeof globalThis & {
			MonacoEnvironment?: {
				getWorker: (_moduleId: string, label: string) => Worker | Promise<Worker>;
			};
		};

		globalAny.MonacoEnvironment = {
			async getWorker(_moduleId, label) {
				const WorkerConstructor = await loadMonacoWorkerConstructor(label);
				return createMonacoWorker(WorkerConstructor, getMonacoWorkerUrlByLabel(label));
			}
		};
	};

	let startRuntime: (() => Promise<void>) | null = null;
	const bumpPreviewReloadToken = () => {
		previewReloadToken += 1;
	};
	const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string) => {
		let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
		const timeoutPromise = new Promise<T>((_resolve, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
			}, timeoutMs);
		});

		try {
			return await Promise.race([promise, timeoutPromise]);
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
		}
	};
	const checkRuntimeHealth = async () => {
		if (!webcontainer) return false;

		try {
			await withTimeout(
				webcontainer.fs.readFile('package.json', 'utf-8'),
				runtimeHealthcheckTimeoutMs,
				'WebContainer health check'
			);
			return true;
		} catch {
			return false;
		}
	};

	const teardownRuntime = () => {
		if (syncTimer) {
			clearTimeout(syncTimer);
			syncTimer = null;
		}
		devProcess?.kill();
		devProcess = null;
		isStartingDevServer = false;
		previewUrl = '';
		previewReloadToken = 0;
		try {
			webcontainer?.teardown();
		} catch {
			// Ignore teardown errors during restart/unmount.
		}
		webcontainer = null;
	};

	const retryRuntime = () => {
		if (!startRuntime || isBootingRuntime) return;
		errorMessage = '';
		syncError = '';
		status = 'Retrying runtime...';
		teardownRuntime();
		void startRuntime();
	};

	const mount = () => {
		let isDisposed = false;
		const runProcessWithTimeout = async (
			process: WebContainerProcess,
			label: string,
			timeoutMs = installTimeoutMs
		) => {
			streamProcessOutput(process);
			let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
			const timeoutPromise = new Promise<number>((_resolve, reject) => {
				timeoutHandle = setTimeout(() => {
					process.kill();
					reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
				}, timeoutMs);
			});

			try {
				return await Promise.race([process.exit, timeoutPromise]);
			} finally {
				if (timeoutHandle) {
					clearTimeout(timeoutHandle);
				}
			}
		};

		const startDevServer = async () => {
			if (!webcontainer || devProcess || isStartingDevServer) return;
			isStartingDevServer = true;
			try {
				status = 'Starting dev server...';
				devProcess = await webcontainer.spawn('npm', [
					'run',
					'dev',
					'--',
					'--clearScreen',
					'false'
				]);
				const currentProcess = devProcess;
				streamProcessOutput(currentProcess);
				void currentProcess.exit.then((code) => {
					if (isDisposed) return;
					if (devProcess === currentProcess) {
						devProcess = null;
						status = code === 0 ? 'Dev server stopped' : `Dev server stopped (exit code ${code})`;
					}
				});
			} finally {
				isStartingDevServer = false;
			}
		};

		const setupMonacoEditor = async () => {
			if (!editorHost) {
				return;
			}

			try {
				configureMonacoWorkers();
				const monaco = (await import('monaco-editor')) as MonacoModule;
				const shiki = await import('shiki');
				const shikiMonaco = await import('@shikijs/monaco');

				registerSvelteLanguage(monaco);
				monacoApi = monaco;

				if (isDisposed || !editorHost) {
					return;
				}

				if (!sharedShikiHighlighter) {
					sharedShikiHighlighter = await shiki.createHighlighter({
						themes: ['github-light'],
						langs: ['svelte', 'html', 'css', 'javascript', 'typescript', 'json', 'bash']
					});
				}
				shikiHighlighter = sharedShikiHighlighter;
				if (isDisposed || !editorHost) {
					return;
				}
				if (!isShikiMonacoConfigured) {
					shikiMonaco.shikiToMonaco(shikiHighlighter, monaco);
					isShikiMonacoConfigured = true;
				}
				monaco.editor.setTheme('github-light');
				const fontReadyDocument = document as FontReadyDocument;
				await fontReadyDocument.fonts?.ready;
				monaco.editor.remeasureFonts();
				if (isDisposed || !editorHost) {
					return;
				}

				const initialModel = ensureMonacoModel(activeFilePath);
				if (!initialModel) {
					throw new Error('Could not initialize file model for Monaco.');
				}

				editorInstance = monaco.editor.create(editorHost, {
					model: initialModel,
					theme: 'github-light',
					fontFamily: editorFontStack,
					fontWeight: '400',
					fontSize: 13,
					fontLigatures: false,
					fontVariations: false,
					letterSpacing: 0,
					disableMonospaceOptimizations: true,
					minimap: { enabled: false },
					stickyScroll: { enabled: false },
					automaticLayout: true,
					scrollBeyondLastLine: false,
					wordWrap: 'off',
					tabSize: 2
				});
				monaco.editor.remeasureFonts();

				editorChangeSubscription = editorInstance.onDidChangeModelContent(() => {
					const currentModel = editorInstance?.getModel() ?? null;
					const filePath = getPathFromModel(currentModel);
					if (!filePath) return;

					const nextValue = currentModel?.getValue() ?? '';
					fileContents = { ...fileContents, [filePath]: nextValue };
					queueSync(filePath);
				});
			} catch (error) {
				if (isDisposed) {
					return;
				}
				errorMessage =
					error instanceof Error ? error.message : 'Could not initialize Monaco editor.';
			}
		};

		const startWebcontainer = async () => {
			if (webcontainer || isBootingRuntime) return;
			isBootingRuntime = true;

			try {
				if (!crossOriginIsolated) {
					let canAttemptReload = true;
					try {
						canAttemptReload = sessionStorage.getItem(isolationReloadStorageKey) !== '1';
					} catch {
						canAttemptReload = false;
					}
					if (canAttemptReload) {
						try {
							sessionStorage.setItem(isolationReloadStorageKey, '1');
						} catch {
							// Ignore if sessionStorage is not available.
						}
						status = 'Reloading for runtime isolation...';
						window.location.reload();
						return;
					}

					errorMessage =
						'WebContainer requires cross-origin isolation (COOP/COEP). Open /playground directly.';
					status = 'Runtime blocked';
					return;
				}
				try {
					sessionStorage.removeItem(isolationReloadStorageKey);
				} catch {
					// Ignore if sessionStorage is not available.
				}
				if (!packageLockContent.trim()) {
					throw new Error('Missing runtime lockfile for the playground.');
				}

				const { WebContainer } = await import('@webcontainer/api');

				status = 'Booting WebContainer...';
				const wc = await WebContainer.boot({ coep: 'require-corp' });

				if (isDisposed) {
					wc.teardown();
					return;
				}

				webcontainer = wc;
				wc.on('error', (error) => {
					if (isDisposed) {
						return;
					}
					errorMessage = error.message;
				});
				wc.on('server-ready', (_, url) => {
					if (isDisposed) {
						return;
					}
					previewUrl = url;
					status = 'Live preview ready';
				});

				await wc.mount(createRuntimeFileTree(fileContents));
				if (isDisposed) {
					wc.teardown();
					return;
				}
				if (dirtyPaths.length > 0) {
					await flushQueuedSyncs();
				}

				runtimeLog = '';
				const installBaseArgs = [
					'ci',
					'--no-audit',
					'--no-fund',
					'--progress=false',
					'--prefer-offline',
					'--fetch-retries=5',
					'--fetch-retry-mintimeout=3000',
					'--fetch-retry-maxtimeout=120000',
					'--cache=/tmp/npm-cache'
				];
				type InstallAttempt = { label: string; args: string[]; beforeArgs?: string[] };
				const installAttempts: InstallAttempt[] = [
					{
						label: 'Installing dependencies from lockfile...',
						args: installBaseArgs
					},
					{
						label: 'Retrying install with clean cache + npm registry...',
						beforeArgs: ['cache', 'clean', '--force', '--cache=/tmp/npm-cache'],
						args: [...installBaseArgs, '--registry=https://registry.npmjs.org/']
					},
					{
						label: 'Retrying install with online preference...',
						args: [...installBaseArgs, '--prefer-online', '--registry=https://registry.npmjs.org/']
					}
				];

				let installExitCode = 1;
				for (let attemptIndex = 0; attemptIndex < installAttempts.length; attemptIndex += 1) {
					const attempt = installAttempts[attemptIndex]!;
					status = attempt.label;

					if (attempt.beforeArgs) {
						appendLog(`\n[playground] npm ${attempt.beforeArgs.join(' ')}\n`);
						const prepProcess = await wc.spawn('npm', attempt.beforeArgs);
						await runProcessWithTimeout(
							prepProcess,
							`npm ${attempt.beforeArgs.join(' ')}`,
							installTimeoutMs / 2
						);
					}

					appendLog(`\n[playground] npm ${attempt.args.join(' ')}\n`);

					const installProcess = await wc.spawn('npm', attempt.args);
					installExitCode = await runProcessWithTimeout(
						installProcess,
						`npm ${attempt.args.join(' ')}`,
						installTimeoutMs
					);

					if (installExitCode === 0) {
						break;
					}

					appendLog(
						`\n[playground] install attempt ${attemptIndex + 1} failed (exit code ${installExitCode}).\n`
					);
				}

				if (installExitCode !== 0) {
					const debugLogPath = extractLastNpmDebugLogPath(runtimeLog);
					if (debugLogPath) {
						try {
							const debugLogContents = await wc.fs.readFile(debugLogPath, 'utf-8');
							const debugLogTail = String(debugLogContents).split('\n').slice(-120).join('\n');
							appendLog(`\n[playground] npm debug log tail (${debugLogPath})\n${debugLogTail}\n`);
						} catch {
							appendLog(`\n[playground] could not read npm debug log file at ${debugLogPath}\n`);
						}
					}

					const logTail = runtimeLog.split('\n').slice(-60).join('\n').trim();
					throw new Error(
						logTail
							? `npm ci failed (exit code ${installExitCode})\n${logTail}`
							: `npm ci failed (exit code ${installExitCode})`
					);
				}

				await startDevServer();
			} catch (error) {
				if (webcontainer) {
					try {
						webcontainer.teardown();
					} catch {
						// Ignore teardown errors after failed boot/install.
					}
				}
				webcontainer = null;
				devProcess?.kill();
				devProcess = null;
				previewUrl = '';
				if (isDisposed) {
					return;
				}
				errorMessage =
					error instanceof Error ? error.message : 'Could not start WebContainer runtime.';
				status = 'Runtime failed';
			} finally {
				isBootingRuntime = false;
			}
		};

		const restartDevServer = async (nextStatus: string) => {
			if (!webcontainer) return;
			status = nextStatus;
			if (devProcess) {
				try {
					devProcess.kill();
				} catch {
					// Ignore process termination errors during recovery.
				}
				devProcess = null;
			}
			await startDevServer();
			bumpPreviewReloadToken();
			queueOpenFileSyncs();
		};

		startRuntime = startWebcontainer;

		const refreshEditorAfterVisibilityResume = () => {
			if (monacoApi) {
				monacoApi.editor.remeasureFonts();
			}
			editorInstance?.layout();
		};

		const recoverAfterVisibilityResume = async () => {
			if (document.visibilityState !== 'visible') return;
			if (isResumeRecoveryRunning) return;

			refreshEditorAfterVisibilityResume();

			if (!webcontainer) {
				queueOpenFileSyncs();
				void startWebcontainer();
				return;
			}

			const hiddenDuration = hiddenStartedAt > 0 ? Date.now() - hiddenStartedAt : 0;
			const shouldRunDeepRecovery = hiddenDuration >= longHiddenThresholdMs;
			hiddenStartedAt = 0;

			if (!shouldRunDeepRecovery) {
				queueOpenFileSyncs();
				if (!devProcess) {
					void startDevServer();
				}
				return;
			}

			isResumeRecoveryRunning = true;
			try {
				status = 'Checking runtime after tab inactivity...';
				const isHealthy = await checkRuntimeHealth();
				if (!isHealthy) {
					status = 'Runtime disconnected. Rebooting...';
					teardownRuntime();
					await startWebcontainer();
					return;
				}

				await restartDevServer('Refreshing preview runtime...');
			} catch (error) {
				if (!isDisposed) {
					appendLog(
						`\n[playground] failed to recover runtime after backgrounding: ${
							error instanceof Error ? error.message : String(error)
						}\n`
					);
				}
				teardownRuntime();
				await startWebcontainer();
			} finally {
				isResumeRecoveryRunning = false;
			}
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				hiddenStartedAt = Date.now();
				return;
			}
			void recoverAfterVisibilityResume();
		};

		const onWindowFocus = () => {
			if (document.visibilityState !== 'visible') return;
			void recoverAfterVisibilityResume();
		};

		const onWindowBlur = () => {
			hiddenStartedAt = Date.now();
		};

		const onWindowPageHide = () => {
			hiddenStartedAt = Date.now();
		};

		const onWindowPageshow = () => {
			if (document.visibilityState !== 'visible') return;
			queueOpenFileSyncs();
			void recoverAfterVisibilityResume();
		};

		void setupMonacoEditor();
		void startWebcontainer();
		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('focus', onWindowFocus);
		window.addEventListener('blur', onWindowBlur);
		window.addEventListener('pagehide', onWindowPageHide);
		window.addEventListener('pageshow', onWindowPageshow);

		return () => {
			isDisposed = true;
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('focus', onWindowFocus);
			window.removeEventListener('blur', onWindowBlur);
			window.removeEventListener('pagehide', onWindowPageHide);
			window.removeEventListener('pageshow', onWindowPageshow);
			startRuntime = null;
			teardownRuntime();
			editorChangeSubscription?.dispose();
			editorChangeSubscription = null;
			for (const model of Object.values(monacoModelsByPath)) {
				model.dispose();
			}
			for (const filePath of Object.keys(monacoModelsByPath)) {
				delete monacoModelsByPath[filePath];
			}
			editorInstance?.dispose();
			editorInstance = null;
			monacoApi = null;
			shikiHighlighter = null;
		};
	};

	return {
		get activeDemoId() {
			return activeDemoId;
		},
		get activeFilePath() {
			return activeFilePath;
		},
		get collapsedDirs() {
			return collapsedDirs;
		},
		get editorHost() {
			return editorHost;
		},
		set editorHost(nextHost: HTMLDivElement | null) {
			editorHost = nextHost;
		},
		get errorMessage() {
			return errorMessage;
		},
		get isSyncing() {
			return isSyncing;
		},
		get demos() {
			return playgroundDemos;
		},
		get openFilePaths() {
			return openFilePaths;
		},
		get previewUrl() {
			return previewUrl;
		},
		get previewFrameKey() {
			return `${previewUrl}:${previewReloadToken}`;
		},
		get runtimeLog() {
			return runtimeLog;
		},
		get runtimeLogTail() {
			return runtimeLogTail;
		},
		get status() {
			return status;
		},
		get syncError() {
			return syncError;
		},
		get syncingPath() {
			return syncingPath;
		},
		get visibleFileTreeRows() {
			return visibleFileTreeRows;
		},
		closeFile,
		mount,
		openFile,
		retryRuntime,
		switchDemo,
		switchToFile,
		toggleDirectory
	};
};

export type PlaygroundController = ReturnType<typeof createPlaygroundController>;
