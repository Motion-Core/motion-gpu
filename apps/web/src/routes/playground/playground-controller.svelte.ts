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

export const createPlaygroundController = () => {
	let webcontainer: WebContainerInstance | null = null;
	let devProcess: WebContainerProcess | null = null;
	let editorHost: HTMLDivElement | null = null;
	let editorInstance: MonacoEditor | null = null;
	let editorChangeSubscription: MonacoDisposable | null = null;
	let shikiHighlighter: ShikiHighlighter | null = null;
	let previewUrl = $state('');
	let errorMessage = $state('');
	let syncError = $state('');
	let runtimeLog = $state('');
	let status = $state('Booting...');
	let isSyncing = $state(false);
	let syncingPath = $state('');
	let syncTimer: ReturnType<typeof setTimeout> | null = null;
	let activeFilePath = $state('src/App.svelte');
	let openFilePaths = $state<string[]>(['src/App.svelte']);
	let collapsedDirs = $state<Record<string, boolean>>({ 'packages/motion-gpu/dist': true });
	const maxOpenTabs = 3;

	let monacoApi: MonacoModule | null = null;
	const monacoModelsByPath: Record<string, MonacoModel> = {};
	const dirtyPaths: string[] = [];
	let isSyncFlushRunning = false;

	const closeScriptTag = '</' + 'script>';
	const editorFontStack =
		'"Aeonik Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
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

	const packageJsonContent = JSON.stringify(
		{
			name: 'svelte-playground',
			private: true,
			type: 'module',
			scripts: {
				dev: 'vite --host 0.0.0.0 --port 4173'
			},
			dependencies: {
				svelte: 'https://registry.npmjs.org/svelte/-/svelte-5.51.0.tgz',
				'@motion-core/motion-gpu': 'file:./packages/motion-gpu'
			},
			devDependencies: {
				'@sveltejs/vite-plugin-svelte':
					'https://registry.npmjs.org/@sveltejs/vite-plugin-svelte/-/vite-plugin-svelte-6.2.4.tgz',
				vite: 'https://registry.npmjs.org/vite/-/vite-7.3.1.tgz'
			}
		},
		null,
		2
	);
	const viteConfigContent = [
		"import { defineConfig } from 'vite';",
		"import { svelte } from '@sveltejs/vite-plugin-svelte';",
		'',
		'export default defineConfig({',
		'\tplugins: [svelte()]',
		'});'
	].join('\n');
	const indexHtmlContent = [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'\t<meta charset="UTF-8" />',
		'\t<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
		'<style>html,body,#app{width:100%;height:100%;margin:0;overflow:hidden;background:#E9E9E9;}</style>',
		'\t<title>Svelte Playground</title>',
		'</head>',
		'<body>',
		'\t<div id="app"></div>',
		`\t<script type="module" src="/src/main.js">${closeScriptTag}`,
		'</body>',
		'</html>'
	].join('\n');
	const mainJsContent = [
		"import { mount } from 'svelte';",
		"import App from './App.svelte';",
		'',
		"mount(App, { target: document.getElementById('app') });"
	].join('\n');
	const initialAppCode = [
		'<script>',
		"\timport { FragCanvas, defineMaterial } from '@motion-core/motion-gpu';",
		'',
		'\tconst material = defineMaterial({',
		'\t\tfragment: `',
		'fn frag(uv: vec2f) -> vec4f {',
		'\tlet r = motiongpuFrame.resolution;',
		'\tlet p = vec2f(uv.x * r.x + 0.5, uv.y * r.y + 0.5);',
		'',
		'\tvar h = vec3f(0.0);',
		'\tvar c = vec3f(1.0);',
		'\tvar A = 0.0;',
		'\tvar l = 0.0;',
		'\tvar a = 0.0;',
		'',
		'\tfor (var i = 0.6; i > 0.1; i -= 0.1) {',
		'\t\ta = (motiongpuFrame.time + i) * 4.0;',
		'\t\ta -= sin(a);',
		'\t\ta -= sin(a);',
		'',
		'\t\tlet t = cos(a / 4.0 + vec2f(0.0, 11.0));',
		'\t\tlet R = mat2x2f(vec2f(t.x, t.y), vec2f(-t.y, t.x));',
		'',
		'\t\tvar u = (p * 2.0 - r) / r.y / 0.5;',
		'\t\tlet ur = transpose(R) * u;',
		'\t\tu -= R * clamp(ur, -vec2f(i), vec2f(i));',
		'',
		'\t\tl = max(length(u), 0.1);',
		'\t\tA = min((l - 0.1) * r.y / 5.0, 1.0);',
		'\t\th = sin(i * 10.0 + a / 3.0 + vec3f(1.0, 3.0, 5.0)) / 5.0 + 0.8;',
		'\t\tc = mix(h, c, A) * mix(vec3f(1.0), h + A * u.y / l / 2.0, 0.1 / l);',
		'\t}',
		'',
		'\treturn vec4f(tanh(c * c), 1.0);',
		'}`',
		'\t});',
		closeScriptTag,
		'',
		'<FragCanvas {material} />'
	].join('\n');

	const initialWorkerFiles: Record<string, string> = {
		'package.json': packageJsonContent,
		'vite.config.js': viteConfigContent,
		'index.html': indexHtmlContent,
		'src/main.js': mainJsContent,
		'src/App.svelte': initialAppCode,
		'packages/motion-gpu/package.json': motionGpuPackageJson,
		...Object.fromEntries(
			Object.entries(motionGpuDistFiles).map(([path, contents]) => [
				`packages/motion-gpu/dist/${path}`,
				contents
			])
		)
	};
	let fileContents = $state<Record<string, string>>({ ...initialWorkerFiles });

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

	const fileTree = buildFileTree(Object.keys(initialWorkerFiles));
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

	const files: FileSystemTree = buildDirectoryTree(initialWorkerFiles) as FileSystemTree;
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

	const mount = () => {
		let isDisposed = false;

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

				shikiHighlighter = await shiki.createHighlighter({
					themes: ['github-light'],
					langs: ['svelte', 'html', 'css', 'javascript', 'typescript', 'json', 'bash']
				});
				if (isDisposed || !editorHost) {
					return;
				}
				shikiMonaco.shikiToMonaco(shikiHighlighter, monaco);
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
			if (!crossOriginIsolated) {
				errorMessage =
					'WebContainer requires cross-origin isolation (COOP/COEP). Refresh /playground directly once.';
				status = 'Runtime blocked';
				return;
			}

			try {
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

				await wc.mount(files);
				if (isDisposed) {
					wc.teardown();
					return;
				}
				if (dirtyPaths.length > 0) {
					await flushQueuedSyncs();
				}

				runtimeLog = '';
				const installBaseArgs = [
					'install',
					'--no-audit',
					'--no-fund',
					'--progress=false',
					'--prefer-online',
					'--fetch-retries=5',
					'--fetch-retry-mintimeout=3000',
					'--fetch-retry-maxtimeout=120000',
					'--cache=/tmp/npm-cache'
				];
				type InstallAttempt = { label: string; args: string[]; beforeArgs?: string[] };
				const installAttempts: InstallAttempt[] = [
					{
						label: 'Installing dependencies...',
						args: installBaseArgs
					},
					{
						label: 'Retrying install with clean cache + npm registry...',
						beforeArgs: ['cache', 'clean', '--force', '--cache=/tmp/npm-cache'],
						args: [...installBaseArgs, '--registry=https://registry.npmjs.org/']
					},
					{
						label: 'Retrying install with legacy peer deps...',
						args: [
							...installBaseArgs,
							'--legacy-peer-deps',
							'--registry=https://registry.npmjs.org/'
						]
					}
				];

				let installExitCode = 1;
				for (let attemptIndex = 0; attemptIndex < installAttempts.length; attemptIndex += 1) {
					const attempt = installAttempts[attemptIndex]!;
					status = attempt.label;

					if (attempt.beforeArgs) {
						appendLog(`\n[playground] npm ${attempt.beforeArgs.join(' ')}\n`);
						const prepProcess = await wc.spawn('npm', attempt.beforeArgs);
						streamProcessOutput(prepProcess);
						await prepProcess.exit;
					}

					appendLog(`\n[playground] npm ${attempt.args.join(' ')}\n`);

					const installProcess = await wc.spawn('npm', attempt.args);
					streamProcessOutput(installProcess);
					installExitCode = await installProcess.exit;

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
							? `npm install failed (exit code ${installExitCode})\n${logTail}`
							: `npm install failed (exit code ${installExitCode})`
					);
				}

				status = 'Starting dev server...';
				devProcess = await wc.spawn('npm', ['run', 'dev', '--', '--clearScreen', 'false']);
				streamProcessOutput(devProcess);
			} catch (error) {
				if (isDisposed) {
					return;
				}
				errorMessage =
					error instanceof Error ? error.message : 'Could not start WebContainer runtime.';
				status = 'Runtime failed';
			}
		};

		void setupMonacoEditor();
		void startWebcontainer();

		return () => {
			isDisposed = true;
			if (syncTimer) {
				clearTimeout(syncTimer);
				syncTimer = null;
			}
			devProcess?.kill();
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
			shikiHighlighter?.dispose?.();
			shikiHighlighter = null;
			webcontainer?.teardown();
			devProcess = null;
			webcontainer = null;
		};
	};

	return {
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
		get openFilePaths() {
			return openFilePaths;
		},
		get previewUrl() {
			return previewUrl;
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
		switchToFile,
		toggleDirectory
	};
};

export type PlaygroundController = ReturnType<typeof createPlaygroundController>;
