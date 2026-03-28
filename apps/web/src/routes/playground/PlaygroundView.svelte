<script lang="ts">
	import { tick } from 'svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import PlaygroundFileTree from './components/PlaygroundFileTree.svelte';
	import PlaygroundEditor from './components/PlaygroundEditor.svelte';
	import PlaygroundPreview from './components/PlaygroundPreview.svelte';

	import type { PlaygroundController } from './playground-controller.svelte';

	let {
		controller,
		onSelectDemo,
		onEditorHostChange,
		onPreviewFrameChange
	}: {
		controller: PlaygroundController;
		onSelectDemo: (demoId: string) => void;
		onEditorHostChange: (host: HTMLDivElement | null) => void;
		onPreviewFrameChange: (frame: HTMLIFrameElement | null) => void;
	} = $props();
	let workspaceHost: HTMLDivElement | null = null;
	let sidebarHeaderHost: HTMLDivElement | null = null;
	let sidebarListHost: HTMLDivElement | null = null;
	let treeWidth = $state(256);
	let previewWidth = $state(420);
	let mobileTreeHeight = $state(0);
	let activeResizeHandle: HTMLButtonElement | null = null;
	let activeResize = $state<{
		target: 'tree' | 'preview';
		pointerId: number;
		startX: number;
		startTreeWidth: number;
		startPreviewWidth: number;
	} | null>(null);

	const RESIZER_SIZE = 1;
	const MIN_TREE_WIDTH = 180;
	const MIN_EDITOR_WIDTH = 380;
	const MIN_PREVIEW_WIDTH = 260;
	const MOBILE_TREE_MIN_HEIGHT = 120;
	const MOBILE_TREE_EXPANDED_FLOOR = 180;
	const MOBILE_TREE_MAX_VIEWPORT_RATIO = 0.42;

	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
	const getWorkspaceWidth = () => workspaceHost?.clientWidth ?? 0;
	const isDesktopViewport = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	const getMaxTreeWidth = (workspaceWidth: number, nextPreviewWidth = previewWidth) =>
		Math.max(
			MIN_TREE_WIDTH,
			workspaceWidth - RESIZER_SIZE - RESIZER_SIZE - nextPreviewWidth - MIN_EDITOR_WIDTH
		);

	const getMaxPreviewWidth = (workspaceWidth: number, nextTreeWidth = treeWidth) =>
		Math.max(
			MIN_PREVIEW_WIDTH,
			workspaceWidth - nextTreeWidth - RESIZER_SIZE - RESIZER_SIZE - MIN_EDITOR_WIDTH
		);

	const clampPanelWidths = () => {
		const workspaceWidth = getWorkspaceWidth();
		if (workspaceWidth <= 0) return;

		treeWidth = clamp(treeWidth, MIN_TREE_WIDTH, getMaxTreeWidth(workspaceWidth));

		previewWidth = clamp(
			previewWidth,
			MIN_PREVIEW_WIDTH,
			getMaxPreviewWidth(workspaceWidth, treeWidth)
		);
	};

	const workspaceColumns = $derived.by(() => {
		const treeColumn = `${Math.round(treeWidth)}px`;
		const treeResizerColumn = `${RESIZER_SIZE}px`;
		const previewResizerColumn = `${RESIZER_SIZE}px`;
		const previewColumn = `${Math.round(previewWidth)}px`;
		return `${treeColumn} ${treeResizerColumn} minmax(0,1fr) ${previewResizerColumn} ${previewColumn}`;
	});
	const workspaceRows = $derived.by(() => {
		const isMobile =
			typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;
		const treeRow = isMobile ? `${mobileTreeHeight}px` : 'minmax(0,1fr)';
		return `${treeRow} minmax(0,1fr) minmax(0,1fr)`;
	});
	const demoSelectOptions = $derived.by(() =>
		controller.demos.map((demo) => ({
			value: demo.id,
			label: demo.name
		}))
	);
	const trackMobileTreeDependencies = (
		_collapsedDirs: Record<string, boolean>,
		_rowCount: number
	) => {};
	const handleSidebarHeaderHostChange = (host: HTMLDivElement | null) => {
		sidebarHeaderHost = host;
	};
	const handleSidebarListHostChange = (host: HTMLDivElement | null) => {
		sidebarListHost = host;
	};
	const recomputeMobileTreeHeight = () => {
		if (typeof window === 'undefined') return;
		if (!window.matchMedia('(max-width: 1023px)').matches) {
			mobileTreeHeight = 0;
			return;
		}

		const headerHeight = sidebarHeaderHost?.offsetHeight ?? 0;
		const listHeight = sidebarListHost?.scrollHeight ?? 0;
		const desiredHeight = headerHeight + listHeight;
		const maxHeight = Math.max(
			MOBILE_TREE_MIN_HEIGHT,
			Math.round(window.innerHeight * MOBILE_TREE_MAX_VIEWPORT_RATIO)
		);
		const targetHeight = Math.max(desiredHeight, MOBILE_TREE_EXPANDED_FLOOR);
		mobileTreeHeight = clamp(targetHeight, MOBILE_TREE_MIN_HEIGHT, maxHeight);
	};

	const beginResize = (target: 'tree' | 'preview', event: PointerEvent) => {
		if (event.button !== 0 || !workspaceHost || !isDesktopViewport()) return;
		const handle = event.currentTarget;
		if (!(handle instanceof HTMLButtonElement)) return;

		event.preventDefault();
		try {
			handle.setPointerCapture(event.pointerId);
		} catch {
			// Ignore if the browser cannot capture this pointer.
		}
		activeResizeHandle = handle;
		activeResize = {
			target,
			pointerId: event.pointerId,
			startX: event.clientX,
			startTreeWidth: treeWidth,
			startPreviewWidth: previewWidth
		};
		document.body.classList.add('playground-resizing');
	};

	const updateResize = (event: PointerEvent) => {
		if (!activeResize || !workspaceHost || event.pointerId !== activeResize.pointerId) return;

		const workspaceWidth = getWorkspaceWidth();
		if (workspaceWidth <= 0) return;

		const deltaX = event.clientX - activeResize.startX;

		if (activeResize.target === 'tree') {
			treeWidth = clamp(
				activeResize.startTreeWidth + deltaX,
				MIN_TREE_WIDTH,
				getMaxTreeWidth(workspaceWidth)
			);
			previewWidth = clamp(
				previewWidth,
				MIN_PREVIEW_WIDTH,
				getMaxPreviewWidth(workspaceWidth, treeWidth)
			);
			return;
		}

		previewWidth = clamp(
			activeResize.startPreviewWidth - deltaX,
			MIN_PREVIEW_WIDTH,
			getMaxPreviewWidth(workspaceWidth)
		);
	};

	const endResize = (event?: PointerEvent) => {
		if (!activeResize) return;
		if (event && event.pointerId !== activeResize.pointerId) return;
		const pointerId = activeResize.pointerId;

		activeResize = null;
		if (activeResizeHandle?.hasPointerCapture(pointerId)) {
			activeResizeHandle.releasePointerCapture(pointerId);
		}
		activeResizeHandle = null;
		document.body.classList.remove('playground-resizing');
	};

	const resizeByKeyboard = (target: 'tree' | 'preview', event: KeyboardEvent) => {
		if (!isDesktopViewport()) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

		event.preventDefault();
		const workspaceWidth = getWorkspaceWidth();
		if (workspaceWidth <= 0) return;
		const step = event.shiftKey ? 48 : 16;
		const direction = event.key === 'ArrowRight' ? 1 : -1;

		if (target === 'tree') {
			treeWidth = clamp(
				treeWidth + direction * step,
				MIN_TREE_WIDTH,
				getMaxTreeWidth(workspaceWidth)
			);
			previewWidth = clamp(
				previewWidth,
				MIN_PREVIEW_WIDTH,
				getMaxPreviewWidth(workspaceWidth, treeWidth)
			);
			return;
		}

		previewWidth = clamp(
			previewWidth - direction * step,
			MIN_PREVIEW_WIDTH,
			getMaxPreviewWidth(workspaceWidth)
		);
	};

	$effect(() => {
		const host = workspaceHost;
		if (!host || typeof ResizeObserver === 'undefined') return;

		clampPanelWidths();

		const observer = new ResizeObserver(() => {
			clampPanelWidths();
		});
		observer.observe(host);

		return () => observer.disconnect();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

		const onPointerMove = (event: PointerEvent) => updateResize(event);
		const onPointerUp = (event: PointerEvent) => endResize(event);

		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);

		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerUp);
			document.body.classList.remove('playground-resizing');
		};
	});
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mql = window.matchMedia('(max-width: 1023px)');
		recomputeMobileTreeHeight();
		const onChange = () => recomputeMobileTreeHeight();
		window.addEventListener('resize', onChange);
		mql.addEventListener?.('change', onChange);
		return () => {
			window.removeEventListener('resize', onChange);
			mql.removeEventListener?.('change', onChange);
		};
	});
	$effect(() => {
		if (typeof window === 'undefined') return;
		trackMobileTreeDependencies(controller.collapsedDirs, controller.visibleFileTreeRows.length);
		void tick().then(() => {
			recomputeMobileTreeHeight();
		});
	});
	$effect(() => {
		controller.setEditorTheme(themeStore.isDark ? 'dark' : 'light');
	});
</script>

<main
	class="flex h-dvh min-h-0 flex-col overflow-hidden bg-background-muted p-2 dark:bg-background"
>
	<div
		bind:this={workspaceHost}
		class={`playground-workspace relative min-h-0 flex-1 ${
			activeResize ? 'playground-workspace--resizing' : ''
		}`}
		style={`--playground-columns: ${workspaceColumns}; --playground-rows: ${workspaceRows};`}
	>
		<PlaygroundFileTree
			{controller}
			onHeaderHostChange={handleSidebarHeaderHostChange}
			onListHostChange={handleSidebarListHostChange}
		/>
		<button
			type="button"
			aria-label="Resize file tree panel"
			tabindex={0}
			class={`panel-resizer ${activeResize?.target === 'tree' ? 'panel-resizer--active' : ''}`}
			onpointerdown={(event) => beginResize('tree', event)}
			onkeydown={(event) => resizeByKeyboard('tree', event)}
		></button>

		<div class="playground-editor-slot flex min-h-0 overflow-hidden">
			<PlaygroundEditor {controller} {onEditorHostChange} />
		</div>
		<button
			type="button"
			aria-label="Resize preview panel"
			tabindex={0}
			class={`panel-resizer ${activeResize?.target === 'preview' ? 'panel-resizer--active' : ''}`}
			onpointerdown={(event) => beginResize('preview', event)}
			onkeydown={(event) => resizeByKeyboard('preview', event)}
		></button>

		<PlaygroundPreview
			{controller}
			activeDemoId={controller.activeDemoId}
			demoOptions={demoSelectOptions}
			{onSelectDemo}
			{onPreviewFrameChange}
		/>
	</div>
</main>

<style>
	.playground-workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		row-gap: 2px;
		column-gap: 2px;
	}

	.playground-editor-slot > :global(*) {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
	}

	.playground-workspace--resizing {
		transition: none;
	}

	@media (min-width: 1024px) {
		.playground-workspace {
			grid-template-columns: var(--playground-columns);
		}

		.panel-resizer {
			appearance: none;
			padding: 0;
			border: 0;
			position: relative;
			display: block;
			width: 100%;
			height: 100%;
			cursor: col-resize;
			touch-action: none;
			background: transparent;
			z-index: 2;
		}

		.panel-resizer::after {
			position: absolute;
			top: 0;
			right: -6px;
			bottom: 0;
			left: -6px;
			content: '';
		}

		.panel-resizer::before {
			position: absolute;
			top: 0;
			left: 50%;
			height: 100%;
			content: '';
			border-left: 1px solid transparent;
			transform: translateX(-0.5px);
			opacity: 0;
		}

		.playground-workspace--resizing .panel-resizer--active::before {
			border-left-color: var(--color-accent);
			opacity: 1;
		}
	}

	@media (max-width: 1023px) {
		.playground-workspace {
			grid-template-rows: var(--playground-rows);
			row-gap: 4px;
		}

		.panel-resizer {
			display: none;
		}
	}

	:global(body.playground-resizing) {
		cursor: col-resize;
		user-select: none;
	}

	:global(.cm-editor),
	:global(.cm-editor .cm-content),
	:global(.cm-editor .cm-gutter),
	:global(.cm-editor .cm-scroller) {
		font-family:
			'Berkeley Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
			'Courier New', monospace !important;
		font-kerning: none;
		font-variant-ligatures: none;
		font-feature-settings:
			'liga' 0,
			'calt' 0;
		text-rendering: geometricPrecision;
	}

	:global(.cm-editor),
	:global(.cm-editor.cm-focused),
	:global(.cm-editor:focus),
	:global(.cm-editor:focus-visible),
	:global(.cm-editor .cm-content),
	:global(.cm-editor .cm-content:focus),
	:global(.cm-editor .cm-content:focus-visible) {
		outline: none !important;
		outline-offset: 0 !important;
		transition: none !important;
	}

	:global(.cm-editor),
	:global(.cm-editor .cm-gutters) {
		background-color: var(--playground-editor-bg) !important;
	}

	:global(.cm-editor) {
		height: 100%;
	}

	:global(.cm-editor .cm-activeLine),
	:global(.cm-editor .cm-activeLineGutter) {
		background-color: var(--playground-editor-active-line-bg) !important;
		border-color: transparent !important;
	}

	:global(.cm-editor .cm-foldGutter) {
		width: 0 !important;
		min-width: 0 !important;
		padding: 0 !important;
		margin: 0 !important;
		overflow: hidden !important;
	}

	:global(.cm-editor .cm-foldGutter .cm-gutterElement) {
		display: none !important;
	}

	:global(.cm-editor .cm-scroller) {
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--color-foreground) 12%, transparent) transparent;
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar) {
		width: 10px;
		height: 10px;
		--playground-cm-thumb-color: color-mix(in srgb, var(--color-foreground) 20%, transparent);
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar:hover) {
		--playground-cm-thumb-color: color-mix(in srgb, var(--color-foreground) 52%, transparent);
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar-thumb) {
		background-color: var(--playground-cm-thumb-color);
		border: 1px solid transparent;
		border-radius: 9999px;
		background-clip: content-box;
		transition: background-color 120ms ease-out;
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar-thumb:hover) {
		background-color: color-mix(in srgb, var(--color-foreground) 62%, transparent);
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar-thumb:active) {
		background-color: color-mix(in srgb, var(--color-foreground) 70%, transparent);
	}

	:global(.cm-editor .cm-scroller::-webkit-scrollbar-corner) {
		background: transparent;
	}

	:global(html:not(.dark)) {
		--playground-editor-bg: transparent;
		--playground-editor-fg: #1f2328;
		--playground-editor-gutter-fg: #6e7781;
		--playground-editor-gutter-border: #d0d7de;
		--playground-editor-active-line-bg: color-mix(in srgb, var(--color-accent) 10%, transparent);
		--playground-editor-selection-bg: rgb(9 105 218 / 20%);
		--playground-editor-cursor: #1f2328;
		--playground-token-keyword: #cf222e;
		--playground-token-function: #8250df;
		--playground-token-string: #0a3069;
		--playground-token-comment: #6e7781;
		--playground-token-number: #0550ae;
		--playground-token-type: #953800;
		--playground-token-tag: #116329;
		--playground-token-property: #0550ae;
		--playground-token-variable: #1f2328;
		--playground-token-constant: #0550ae;
		--playground-token-invalid: #cf222e;
	}

	:global(html.dark) {
		--playground-editor-bg: transparent;
		--playground-editor-fg: #e6edf3;
		--playground-editor-gutter-fg: #7d8590;
		--playground-editor-gutter-border: #30363d;
		--playground-editor-active-line-bg: color-mix(in srgb, var(--color-accent) 14%, transparent);
		--playground-editor-selection-bg: rgb(47 129 247 / 20%);
		--playground-editor-cursor: #e6edf3;
		--playground-token-keyword: #ff7b72;
		--playground-token-function: #d2a8ff;
		--playground-token-string: #a5d6ff;
		--playground-token-comment: #8b949e;
		--playground-token-number: #79c0ff;
		--playground-token-type: #ffa657;
		--playground-token-tag: #7ee787;
		--playground-token-property: #79c0ff;
		--playground-token-variable: #e6edf3;
		--playground-token-constant: #79c0ff;
		--playground-token-invalid: #ff7b72;
	}
</style>
