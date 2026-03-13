import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { css as cssLanguage } from '@codemirror/lang-css';
import { html as htmlLanguage } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json as jsonLanguage } from '@codemirror/lang-json';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { svelte as svelteLanguage } from '@replit/codemirror-lang-svelte';
import { basicSetup } from 'codemirror';
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

type EditorThemeMode = 'light' | 'dark';
type FileTreeNode =
	| { kind: 'directory'; name: string; path: string; children: FileTreeNode[] }
	| { kind: 'file'; name: string; path: string };
type FileTreeRow = {
	kind: 'directory' | 'file';
	name: string;
	path: string;
	depth: number;
};

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

const editorSyntaxTheme = syntaxHighlighting(
	HighlightStyle.define([
		{
			tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword],
			color: 'var(--playground-token-keyword)'
		},
		{ tag: [t.string, t.special(t.string), t.docString], color: 'var(--playground-token-string)' },
		{ tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: 'var(--playground-token-number)' },
		{ tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--playground-token-comment)' },
		{ tag: [t.typeName, t.className, t.namespace, t.macroName], color: 'var(--playground-token-type)' },
		{
			tag: [t.function(t.variableName), t.function(t.propertyName)],
			color: 'var(--playground-token-function)'
		},
		{ tag: [t.tagName], color: 'var(--playground-token-tag)' },
		{ tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--playground-token-property)' },
		{ tag: [t.variableName, t.name], color: 'var(--playground-token-variable)' },
		{ tag: [t.regexp, t.escape, t.special(t.variableName), t.url], color: 'var(--playground-token-constant)' },
		{ tag: [t.invalid], color: 'var(--playground-token-invalid)' }
	])
);

const createEditorTheme = (mode: EditorThemeMode) =>
	EditorView.theme(
		{
			'&': {
				height: '100%',
				fontSize: '13px',
				backgroundColor: 'var(--playground-editor-bg)',
				color: 'var(--playground-editor-fg)'
			},
			'.cm-scroller': {
				fontFamily: editorFontStack,
				lineHeight: '1.55'
			},
			'.cm-content': {
				padding: '10px 0 12px'
			},
			'.cm-line': {
				padding: '0 12px 0 14px'
			},
			'.cm-gutters': {
				backgroundColor: 'var(--playground-editor-bg)',
				borderRight: '1px solid var(--playground-editor-gutter-border)',
				color: 'var(--playground-editor-gutter-fg)',
				minWidth: '44px'
			},
			'.cm-gutterElement': {
				padding: '0 10px 0 12px'
			},
			'.cm-activeLine': {
				backgroundColor: 'var(--playground-editor-active-line-bg)'
			},
			'.cm-activeLineGutter': {
				backgroundColor: 'var(--playground-editor-active-line-bg)'
			},
			'.cm-selectionBackground': {
				backgroundColor: 'var(--playground-editor-selection-bg) !important'
			},
			'&.cm-focused': {
				outline: 'none'
			},
			'&.cm-focused .cm-cursor': {
				borderLeftColor: 'var(--playground-editor-cursor)'
			}
		},
		{ dark: mode === 'dark' }
	);

const languageExtensionForPath = (filePath: string): Extension => {
	if (filePath.endsWith('.svelte')) return svelteLanguage();
	if (filePath.endsWith('.ts') || filePath.endsWith('.d.ts')) {
		return javascript({ typescript: true });
	}
	if (filePath.endsWith('.js')) return javascript();
	if (filePath.endsWith('.json')) return jsonLanguage();
	if (filePath.endsWith('.html')) return htmlLanguage();
	if (filePath.endsWith('.css')) return cssLanguage();
	return [];
};

export const createPlaygroundController = (initialDemoId?: string | null) => {
	let editorHost: HTMLDivElement | null = null;
	let editorInstance: EditorView | null = null;
	let suppressEditorUpdate = false;

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
	let activeEditorTheme: EditorThemeMode = 'light';

	const languageCompartment = new Compartment();
	const themeCompartment = new Compartment();

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

	const applyEditorTheme = (mode: EditorThemeMode) => {
		if (!editorInstance) return;
		editorInstance.dispatch({
			effects: themeCompartment.reconfigure([createEditorTheme(mode), editorSyntaxTheme])
		});
	};

	const syncEditorWithActiveFile = () => {
		if (!editorInstance) return;

		const nextContents = fileContents[activeFilePath] ?? '';
		const previousContents = editorInstance.state.doc.toString();
		const languageEffect = languageCompartment.reconfigure(
			languageExtensionForPath(activeFilePath)
		);

		if (previousContents === nextContents) {
			editorInstance.dispatch({ effects: languageEffect });
			return;
		}

		suppressEditorUpdate = true;
		try {
			editorInstance.dispatch({
				changes: {
					from: 0,
					to: previousContents.length,
					insert: nextContents
				},
				effects: languageEffect
			});
		} finally {
			suppressEditorUpdate = false;
		}
	};

	const handleEditorUpdate = (update: ViewUpdate) => {
		if (!update.docChanged || suppressEditorUpdate) return;
		const nextValue = update.state.doc.toString();
		const filePath = activeFilePath;
		if ((fileContents[filePath] ?? '') === nextValue) return;
		fileContents = { ...fileContents, [filePath]: nextValue };
		syncingPath = filePath;
		queueBundle();
	};

	const ensureEditor = () => {
		if (!editorHost || editorInstance) return;

		try {
			editorInstance = new EditorView({
				parent: editorHost,
				state: EditorState.create({
					doc: fileContents[activeFilePath] ?? '',
					extensions: [
						basicSetup,
						EditorState.tabSize.of(2),
						indentUnit.of('  '),
						EditorView.lineWrapping,
						keymap.of([indentWithTab]),
						languageCompartment.of(languageExtensionForPath(activeFilePath)),
						themeCompartment.of([createEditorTheme(activeEditorTheme), editorSyntaxTheme]),
						EditorView.updateListener.of(handleEditorUpdate)
					]
				})
			});
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Could not initialize CodeMirror editor.';
		}
	};

	const destroyEditor = () => {
		editorInstance?.destroy();
		editorInstance = null;
	};

	const switchToFile = (filePath: string) => {
		if (!(filePath in fileContents)) return;

		activeFilePath = filePath;
		syncEditorWithActiveFile();
		editorInstance?.focus();
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
		if (editorHost === nextHost) return;
		editorHost = nextHost;

		if (!isMounted) return;

		destroyEditor();
		ensureEditor();
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

		syncEditorWithActiveFile();
		editorInstance?.focus();
		status = `Switched demo: ${demo.name}`;
		queueBundle();
	};

	const setEditorTheme = (mode: EditorThemeMode) => {
		if (activeEditorTheme === mode) return;
		activeEditorTheme = mode;
		applyEditorTheme(mode);
	};

	const mount = () => {
		let isDisposed = false;
		isMounted = true;

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
			editorInstance?.requestMeasure();
		};

		ensureEditor();
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
			destroyEditor();
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
