import MonacoEditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import MonacoCssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker&inline';
import MonacoHtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline';
import MonacoJsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline';
import MonacoTsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline';
import {
	getPlaygroundDemoById,
	playgroundDemos,
	resolvePlaygroundDemoId
} from './playground-demos';
import {
	Bundler,
	ReplProxy,
	buildEvalScript,
	type BundleResult,
	type PlaygroundFile
} from '$lib/playground-engine';
import previewSrcdocTemplate from '$lib/playground-engine/preview/srcdoc/index.html?raw';
import previewDefaultStyles from '$lib/playground-engine/preview/srcdoc/styles.css?raw';

type MonacoModule = typeof import('monaco-editor');
type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type MonacoDisposable = import('monaco-editor').IDisposable;
type MonacoModel = import('monaco-editor').editor.ITextModel;
type MonacoWorkerConstructor = new () => Worker;
type MonacoThemeMode = 'light' | 'dark';
type MonacoTheme = 'github-light' | 'github-dark';
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

const editorFontStack =
	'"Aeonik Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const compactLogForDisplay = (value: string) =>
	value
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^(?:[ \t]*\n)+/, '')
		.replace(/[ \t]+\n/g, '\n');

const formatBundleError = (error: NonNullable<BundleResult['error']>) => {
	const location =
		error.filename && error.start
			? `${error.filename}:${error.start.line}:${error.start.column}`
			: error.filename
				? error.filename
				: '';
	const frame = 'frame' in error && typeof error.frame === 'string' ? error.frame : '';
	const details = [location, error.message, frame].filter(Boolean).join('\n');
	return details || 'Bundle failed.';
};

export const createPlaygroundController = (initialDemoId?: string | null) => {
	let editorHost: HTMLDivElement | null = null;
	let editorInstance: MonacoEditor | null = null;
	let editorChangeSubscription: MonacoDisposable | null = null;
	let shikiHighlighter: ShikiHighlighter | null = null;
	let monacoApi: MonacoModule | null = null;
	const monacoModelsByPath: Record<string, MonacoModel> = {};

	let bundler: Bundler | null = null;
	let bundleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let latestBundle: BundleResult | null = null;
	let isBundleRunning = false;
	let hasPendingBundle = false;
	let lastResolvedSvelteVersion = 'latest';

	let previewFrame: HTMLIFrameElement | null = null;
	let previewProxy: ReplProxy | null = null;
	let previewLoadCleanup: (() => void) | null = null;
	let previewReady = false;
	let isMounted = false;

	let previewReloadToken = $state(0);
	const previewSrcdoc = $state(previewSrcdocTemplate);
	let errorMessage = $state('');
	let syncError = $state('');
	let runtimeLog = $state('');
	let status = $state('Initializing playground...');
	let isSyncing = $state(false);
	let syncingPath = $state('');
	let activeMonacoTheme: MonacoTheme = 'github-light';

	const runtimeTemplateRawModules = import.meta.glob('./runtime-template/src/**/*', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>;

	const runtimeTemplateFiles = Object.fromEntries(
		Object.entries(runtimeTemplateRawModules)
			.map(([path, source]) => {
				const marker = '/runtime-template/src/';
				const markerIndex = path.lastIndexOf(marker);
				if (markerIndex === -1) return null;
				const relativePath = `src/${path.slice(markerIndex + marker.length)}`;
				return [relativePath, source] as const;
			})
			.filter((entry): entry is readonly [string, string] => entry !== null)
	);

	const initialResolvedDemoId = resolvePlaygroundDemoId(initialDemoId);
	let activeDemoId = $state(initialResolvedDemoId);
	let activeFilePath = $state('src/App.svelte');
	let openFilePaths = $state<string[]>(['src/App.svelte']);
	let collapsedDirs = $state<Record<string, boolean>>({});
	const maxOpenTabs = 3;
	const demoAppPath = 'src/App.svelte';
	const demoRuntimePath = 'src/runtime.svelte';

	const baseFiles: Record<string, string> = {
		...runtimeTemplateFiles
	};

	const toFilesForDemo = (demoId: string) => {
		const resolvedDemoId = resolvePlaygroundDemoId(demoId);
		const demo = getPlaygroundDemoById(resolvedDemoId);
		if (!demo) {
			return { ...baseFiles };
		}

		const files: Record<string, string> = {
			...baseFiles,
			[demoAppPath]: demo.appSource
		};

		if (typeof demo.runtimeSource === 'string') {
			files[demoRuntimePath] = demo.runtimeSource;
		}

		return files;
	};

	const initialDemoFiles = toFilesForDemo(initialResolvedDemoId);
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
	const runtimeLogTail = $derived(
		compactLogForDisplay(runtimeLog).split('\n').slice(-120).join('\n')
	);

	const appendLog = (chunk: string) => {
		runtimeLog = (runtimeLog + chunk + '\n').slice(-50000);
	};

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

	const toBundlerFiles = (flatFiles: Record<string, string>): PlaygroundFile[] =>
		Object.entries(flatFiles)
			.filter(([filePath]) => filePath.startsWith('src/'))
			.map(([filePath, contents]) => {
				const name = filePath.slice(4);
				return {
					type: 'file',
					name,
					basename: name.split('/').at(-1) ?? name,
					contents,
					text: true
				};
			});

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

	const getMonacoWorkerConstructorByLabel = (label: string): MonacoWorkerConstructor => {
		if (label === 'json') return MonacoJsonWorker as MonacoWorkerConstructor;
		if (label === 'css' || label === 'scss' || label === 'less') {
			return MonacoCssWorker as MonacoWorkerConstructor;
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			return MonacoHtmlWorker as MonacoWorkerConstructor;
		}
		if (label === 'typescript' || label === 'javascript') {
			return MonacoTsWorker as MonacoWorkerConstructor;
		}
		return MonacoEditorWorker as MonacoWorkerConstructor;
	};

	const createMonacoWorker = (WorkerConstructor: MonacoWorkerConstructor) =>
		new WorkerConstructor();

	const configureMonacoWorkers = () => {
		const globalAny = globalThis as typeof globalThis & {
			MonacoEnvironment?: {
				getWorker: (_moduleId: string, label: string) => Worker | Promise<Worker>;
			};
		};

		globalAny.MonacoEnvironment = {
			getWorker(_moduleId, label) {
				const WorkerConstructor = getMonacoWorkerConstructorByLabel(label);
				return createMonacoWorker(WorkerConstructor);
			}
		};
	};

	const resolveMonacoTheme = (mode: MonacoThemeMode): MonacoTheme =>
		mode === 'dark' ? 'github-dark' : 'github-light';

	const applyMonacoTheme = () => {
		if (!monacoApi) return;
		monacoApi.editor.setTheme(activeMonacoTheme);
	};

	const setEditorTheme = (mode: MonacoThemeMode) => {
		const nextTheme = resolveMonacoTheme(mode);
		if (activeMonacoTheme === nextTheme) {
			return;
		}

		activeMonacoTheme = nextTheme;
		applyMonacoTheme();
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

	const applyBundleToPreview = async (bundle: BundleResult) => {
		if (!previewProxy || !previewReady) {
			return;
		}
		if (bundle.error) {
			return;
		}

		const script = buildEvalScript(bundle);
		if (!script) return;

		await previewProxy.eval(script, bundle.css ?? previewDefaultStyles);
	};

	const runBundle = async () => {
		if (!bundler) return;
		if (isBundleRunning) {
			hasPendingBundle = true;
			return;
		}

		isBundleRunning = true;
		isSyncing = true;
		syncError = '';
		errorMessage = '';
		status = 'Bundling playground...';

		try {
			const files = toBundlerFiles(fileContents);
			if (!files.some((file) => file.name === 'App.svelte')) {
				throw new Error('Missing src/App.svelte in playground files.');
			}

			await bundler.bundle(files, {
				svelte_version: lastResolvedSvelteVersion,
				runes: true
			});

			latestBundle = bundler.result;
			if (!latestBundle) {
				throw new Error('Bundler did not return an output payload.');
			}

			if (latestBundle.error) {
				errorMessage = formatBundleError(latestBundle.error);
				status = 'Build failed';
				return;
			}

			await applyBundleToPreview(latestBundle);
			status = 'Preview ready';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Could not bundle playground sources.';
			status = 'Build failed';
		} finally {
			isSyncing = false;
			syncingPath = '';
			isBundleRunning = false;
			if (hasPendingBundle) {
				hasPendingBundle = false;
				void runBundle();
			}
		}
	};

	const queueBundle = () => {
		if (bundleDebounceTimer) {
			clearTimeout(bundleDebounceTimer);
		}
		bundleDebounceTimer = setTimeout(() => {
			bundleDebounceTimer = null;
			void runBundle();
		}, 140);
	};

	const disconnectPreviewProxy = () => {
		previewLoadCleanup?.();
		previewLoadCleanup = null;
		previewReady = false;
		previewProxy?.destroy();
		previewProxy = null;
	};

	const connectPreviewProxy = () => {
		if (!previewFrame || !isMounted) {
			return;
		}

		disconnectPreviewProxy();

		const frame = previewFrame;
		previewProxy = new ReplProxy(frame, {
			on_error: (event) => {
				appendLog(`[preview:error] ${String(event?.value ?? 'Unknown runtime error')}`);
				errorMessage = `Runtime error in preview: ${String(event?.value ?? 'unknown')}`;
			},
			on_unhandled_rejection: (event) => {
				appendLog(`[preview:unhandledrejection] ${String(event?.value ?? 'Unknown rejection')}`);
			}
		});

		const onLoad = () => {
			if (frame !== previewFrame) return;
			previewReady = true;
			void previewProxy?.handle_links();
			if (latestBundle && !latestBundle.error) {
				void applyBundleToPreview(latestBundle);
			}
		};

		frame.addEventListener('load', onLoad);
		previewLoadCleanup = () => frame.removeEventListener('load', onLoad);
	};

	const setEditorHost = (nextHost: HTMLDivElement | null) => {
		editorHost = nextHost;
	};

	const setPreviewFrame = (nextFrame: HTMLIFrameElement | null) => {
		if (previewFrame === nextFrame) {
			return;
		}

		previewFrame = nextFrame;
		if (!nextFrame) {
			disconnectPreviewProxy();
			return;
		}

		connectPreviewProxy();
	};

	const retryRuntime = () => {
		errorMessage = '';
		syncError = '';
		runtimeLog = '';
		status = 'Reloading preview...';
		previewReloadToken += 1;
		queueBundle();
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
		} else {
			disposeMonacoModel(demoRuntimePath);
		}

		switchToFile(demoAppPath);
		status = `Switched demo: ${demo.name}`;
		queueBundle();
	};

	const mount = () => {
		let isDisposed = false;
		isMounted = true;

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
						themes: ['github-light', 'github-dark'],
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
				applyMonacoTheme();
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
					theme: activeMonacoTheme,
					automaticLayout: true,
					fontFamily: editorFontStack,
					fontSize: 13,
					minimap: { enabled: false },
					lineNumbersMinChars: 3,
					scrollBeyondLastLine: false,
					wordWrap: 'on',
					renderWhitespace: 'selection',
					tabSize: 2,
					insertSpaces: true,
					padding: { top: 10, bottom: 12 }
				});

				editorChangeSubscription = editorInstance.onDidChangeModelContent(() => {
					const currentModel = editorInstance?.getModel();
					const filePath = getPathFromModel(currentModel ?? null);
					if (!filePath) return;

					const nextValue = currentModel?.getValue() ?? '';
					fileContents = { ...fileContents, [filePath]: nextValue };
					syncingPath = filePath;
					queueBundle();
				});
			} catch (error) {
				if (isDisposed) {
					return;
				}
				errorMessage =
					error instanceof Error ? error.message : 'Could not initialize Monaco editor.';
			}
		};

		const setupBundler = () => {
			bundler = new Bundler({
				svelte_version: 'latest',
				onstatus: (message) => {
					if (isDisposed) return;
					if (message) {
						status = message;
					}
				},
				onversion: (version) => {
					lastResolvedSvelteVersion = version;
				},
				onerror: (message) => {
					if (isDisposed) return;
					errorMessage = message;
					status = 'Build failed';
				}
			});
		};

		const onVisibilityChange = () => {
			if (document.visibilityState !== 'visible') return;
			if (monacoApi) {
				monacoApi.editor.remeasureFonts();
			}
			editorInstance?.layout();
		};

		void setupMonacoEditor();
		setupBundler();
		connectPreviewProxy();
		queueBundle();
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			isDisposed = true;
			isMounted = false;
			document.removeEventListener('visibilitychange', onVisibilityChange);
			if (bundleDebounceTimer) {
				clearTimeout(bundleDebounceTimer);
				bundleDebounceTimer = null;
			}
			disconnectPreviewProxy();
			bundler?.destroy();
			bundler = null;
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
		get previewFrameKey() {
			return String(previewReloadToken);
		},
		get previewSrcdoc() {
			return previewSrcdoc;
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
		setEditorHost,
		setEditorTheme,
		setPreviewFrame,
		switchDemo,
		switchToFile,
		toggleDirectory
	};
};

export type PlaygroundController = ReturnType<typeof createPlaygroundController>;
