<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import Document from 'carbon-icons-svelte/lib/Document.svelte';
	import Folder from 'carbon-icons-svelte/lib/Folder.svelte';
	import LogoSvelte from 'carbon-icons-svelte/lib/LogoSvelte.svelte';
	import Return from 'carbon-icons-svelte/lib/Return.svelte';
	import OpenPanelFilledLeft from 'carbon-icons-svelte/lib/OpenPanelFilledLeft.svelte';
	import OpenPanelLeft from 'carbon-icons-svelte/lib/OpenPanelLeft.svelte';
	import { brandingConfig } from '$lib/config/branding';
	import Select from '$lib/components/ui/Select.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';

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
	let isTreeVisible = $state(true);
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
	const MOBILE_TREE_MAX_VIEWPORT_RATIO = 0.42;

	const isSvelteFile = (path: string) => path.endsWith('.svelte');
	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
	const getWorkspaceWidth = () => workspaceHost?.clientWidth ?? 0;
	const isDesktopViewport = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	const getMaxTreeWidth = (workspaceWidth: number, nextPreviewWidth = previewWidth) =>
		Math.max(
			MIN_TREE_WIDTH,
			workspaceWidth - RESIZER_SIZE - RESIZER_SIZE - nextPreviewWidth - MIN_EDITOR_WIDTH
		);

	const getMaxPreviewWidth = (workspaceWidth: number, nextTreeWidth = treeWidth) => {
		const treeAndHandleWidth = isTreeVisible ? nextTreeWidth + RESIZER_SIZE : 0;
		return Math.max(
			MIN_PREVIEW_WIDTH,
			workspaceWidth - treeAndHandleWidth - RESIZER_SIZE - MIN_EDITOR_WIDTH
		);
	};

	const clampPanelWidths = () => {
		const workspaceWidth = getWorkspaceWidth();
		if (workspaceWidth <= 0) return;

		if (isTreeVisible) {
			treeWidth = clamp(treeWidth, MIN_TREE_WIDTH, getMaxTreeWidth(workspaceWidth));
		}

		previewWidth = clamp(
			previewWidth,
			MIN_PREVIEW_WIDTH,
			getMaxPreviewWidth(workspaceWidth, isTreeVisible ? treeWidth : 0)
		);
	};

	const workspaceColumns = $derived.by(() => {
		const treeColumn = isTreeVisible ? `${Math.round(treeWidth)}px` : '0px';
		const treeResizerColumn = isTreeVisible ? `${RESIZER_SIZE}px` : '0px';
		const previewResizerColumn = `${RESIZER_SIZE}px`;
		const previewColumn = `${Math.round(previewWidth)}px`;
		return `${treeColumn} ${treeResizerColumn} minmax(0,1fr) ${previewResizerColumn} ${previewColumn}`;
	});
	const workspaceRows = $derived.by(() => {
		const isMobile =
			typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;
		const treeRow = isMobile ? (isTreeVisible ? `${mobileTreeHeight}px` : '0px') : 'minmax(0,1fr)';
		return `${treeRow} minmax(0,1fr) minmax(0,1fr)`;
	});
	const demoSelectOptions = $derived.by(() =>
		controller.demos.map((demo) => ({
			value: demo.id,
			label: demo.name
		}))
	);
	const toggleTree = () => {
		isTreeVisible = !isTreeVisible;
		if (typeof window !== 'undefined') {
			requestAnimationFrame(() => {
				clampPanelWidths();
			});
		}
	};
	const trackMobileTreeDependencies = (
		_isTreeVisible: boolean,
		_collapsedDirs: Record<string, boolean>,
		_rowCount: number
	) => {};
	const registerEditorHost = (node: HTMLDivElement) => {
		onEditorHostChange(node);
		return {
			destroy() {
				onEditorHostChange(null);
			}
		};
	};
	const registerPreviewFrame = (node: HTMLIFrameElement) => {
		onPreviewFrameChange(node);
		return {
			destroy() {
				onPreviewFrameChange(null);
			}
		};
	};
	const recomputeMobileTreeHeight = () => {
		if (typeof window === 'undefined') return;
		if (!window.matchMedia('(max-width: 1023px)').matches || !isTreeVisible) {
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
		mobileTreeHeight = Math.min(desiredHeight, maxHeight);
	};

	const beginResize = (target: 'tree' | 'preview', event: PointerEvent) => {
		if (event.button !== 0 || !workspaceHost || !isDesktopViewport()) return;
		if (target === 'tree' && !isTreeVisible) return;
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
		trackMobileTreeDependencies(
			isTreeVisible,
			controller.collapsedDirs,
			controller.visibleFileTreeRows.length
		);
		void tick().then(() => {
			recomputeMobileTreeHeight();
		});
	});
	$effect(() => {
		controller.setEditorTheme(themeStore.isDark ? 'dark' : 'light');
	});
</script>

<main class="flex h-dvh min-h-0 flex-col overflow-hidden">
	<div
		class="flex h-9 items-center justify-between border-b border-border bg-background px-2 sm:px-3"
	>
		<div
			class="inline-flex items-center gap-1 py-2 text-sm tracking-tight text-foreground transition-colors hover:text-foreground"
		>
			<a
				href={resolve('/' as const)}
				class="inline-flex items-center gap-1 py-1.5 text-xs font-medium tracking-tight text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
				aria-label="Back to Home"
				title="Back to Home"
			>
				<Return size={16} />
				Return to the homepage
			</a>
		</div>
		<div class="flex items-center gap-4">
			<div>
				<label class="sr-only" for="playground-demo-select">Choose demo</label>
				<Select
					id="playground-demo-select"
					class="w-48"
					triggerClass="w-48"
					value={controller.activeDemoId}
					options={demoSelectOptions}
					onValueChange={onSelectDemo}
					ariaLabel="Choose demo"
				/>
			</div>
			<button
				type="button"
				class={`layout-toggle ${isTreeVisible ? 'layout-toggle--active' : ''}`}
				onclick={toggleTree}
				aria-label="Toggle file tree"
				title="Toggle file tree"
			>
				{#if isTreeVisible}
					<OpenPanelFilledLeft size={16} />
				{:else}
					<OpenPanelLeft size={16} />
				{/if}
			</button>
		</div>
	</div>

	<div
		bind:this={workspaceHost}
		class={`playground-workspace min-h-0 flex-1 ${
			activeResize ? 'playground-workspace--resizing' : ''
		}`}
		style={`--playground-columns: ${workspaceColumns}; --playground-rows: ${workspaceRows};`}
	>
		<aside
			inert={!isTreeVisible}
			aria-hidden={!isTreeVisible}
			class={`playground-sidebar flex min-h-0 flex-col overflow-hidden bg-background lg:max-h-none ${
				isTreeVisible ? '' : 'playground-sidebar--collapsed'
			} `}
		>
			<div
				bind:this={sidebarHeaderHost}
				class="flex h-8 items-center gap-1 border-b border-border px-3 text-sm whitespace-nowrap"
			>
				<span
					class="flex items-center text-accent [&>svg]:size-4 [&>svg]:fill-current"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html brandingConfig.logoRaw}
				</span>
				<span class="font-medium text-foreground"
					>{brandingConfig.name} <span class="text-xs text-accent">playground</span></span
				>
			</div>
			<div bind:this={sidebarListHost} class="overflow-auto py-1 lg:min-h-0 lg:flex-1">
				{#each controller.visibleFileTreeRows as row (row.path)}
					{#if row.kind === 'directory'}
						<button
							type="button"
							onclick={() => controller.toggleDirectory(row.path)}
							class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-normal text-foreground-muted transition-colors duration-150 ease-out hover:bg-background-muted hover:text-foreground"
							style={`padding-left: ${8 + row.depth * 12}px`}
						>
							<span class="inline-flex w-3 items-center justify-center text-foreground/60">
								{#if controller.collapsedDirs[row.path]}
									<ChevronRight size={16} />
								{:else}
									<ChevronDown size={16} />
								{/if}
							</span>
							<span class="inline-flex items-center text-foreground/55">
								<Folder size={16} />
							</span>
							<span class="truncate">{row.name}</span>
						</button>
					{:else}
						<button
							type="button"
							onclick={() => controller.openFile(row.path)}
							class={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-normal transition-colors duration-150 ease-out ${
								controller.activeFilePath === row.path
									? 'bg-background-muted text-foreground'
									: 'text-foreground-muted hover:bg-background-muted hover:text-foreground'
							}`}
							style={`padding-left: ${8 + row.depth * 12}px`}
						>
							<span class="inline-flex items-center text-foreground/55">
								{#if isSvelteFile(row.path)}
									<LogoSvelte size={16} />
								{:else}
									<Document size={16} />
								{/if}
							</span>
							<span class="truncate">{row.name}</span>
						</button>
					{/if}
				{/each}
			</div>
		</aside>
		<button
			type="button"
			aria-label="Resize file tree panel"
			aria-hidden={!isTreeVisible}
			tabindex={isTreeVisible ? 0 : -1}
			class={`panel-resizer ${activeResize?.target === 'tree' ? 'panel-resizer--active' : ''} ${
				isTreeVisible ? '' : 'panel-resizer--hidden'
			}`}
			onpointerdown={(event) => beginResize('tree', event)}
			onkeydown={(event) => resizeByKeyboard('tree', event)}
		></button>

		<section class="flex min-h-0 flex-col bg-background">
			<div class="h-8 border-b border-border">
				<div class="flex items-stretch overflow-x-auto">
					{#each controller.openFilePaths as filePath (filePath)}
						<div
							class={`group inline-flex shrink-0 items-center border-r border-border ${
								controller.activeFilePath === filePath ? 'bg-background-inset' : 'bg-background'
							}`}
						>
							<button
								type="button"
								onclick={() => controller.switchToFile(filePath)}
								class={`px-2.5 py-2 text-left font-mono text-[11px] font-normal transition-colors duration-150 ease-out sm:px-3 sm:text-xs ${
									controller.activeFilePath === filePath
										? 'text-foreground'
										: 'text-foreground-muted hover:text-foreground'
								}`}
							>
								{filePath.split('/').at(-1)}
							</button>
							{#if controller.openFilePaths.length > 1}
								<button
									type="button"
									onclick={(event) => {
										event.stopPropagation();
										controller.closeFile(filePath);
									}}
									class="inline-flex items-center px-3 py-2 text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
									aria-label={`Close ${filePath}`}
								>
									<Close size={16} />
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div
				use:registerEditorHost
				class="min-h-0 flex-1 bg-background-inset"
				aria-label="Svelte component editor"
			></div>

			{#if controller.syncError}
				<p
					class="border-t border-border bg-background px-3 py-2 font-mono text-xs font-normal text-red-500"
					role="alert"
				>
					{controller.syncError}
				</p>
			{/if}

			<section class=" bg-background">
				{#if controller.runtimeLog}
					<details>
						<summary
							class="cursor-pointer px-3 py-2 font-mono text-xs font-medium text-foreground-muted"
						>
							Runtime log ({controller.status})
						</summary>
						<pre
							class="h-32 overflow-auto border-t border-border bg-background-inset px-3 py-2 font-mono text-[11px] leading-5 font-normal whitespace-pre-wrap text-foreground-muted">{controller.runtimeLogTail}</pre>
					</details>
				{:else}
					<p
						class="border-t border-border px-3 py-2 font-mono text-xs font-normal text-foreground-muted"
					>
						{controller.status}
					</p>
				{/if}
			</section>
		</section>
		<button
			type="button"
			aria-label="Resize preview panel"
			tabindex={0}
			class={`panel-resizer ${activeResize?.target === 'preview' ? 'panel-resizer--active' : ''}`}
			onpointerdown={(event) => beginResize('preview', event)}
			onkeydown={(event) => resizeByKeyboard('preview', event)}
		></button>

		<section class="flex min-h-0 flex-col overflow-hidden bg-background">
			<div class="relative min-h-0 flex-1 bg-background-inset">
				{#key controller.previewFrameKey}
					<iframe
						use:registerPreviewFrame
						title="Playground preview"
						srcdoc={controller.previewSrcdoc}
						class="h-full w-full border-0"
						loading="eager"
						sandbox="allow-scripts allow-forms allow-modals allow-popups"
						referrerpolicy="no-referrer"
					></iframe>
				{/key}
			</div>

			{#if controller.errorMessage}
				<div class="border-t border-border bg-background px-3 py-2">
					<p class="font-mono text-xs font-normal whitespace-pre-wrap text-red-500" role="alert">
						{controller.errorMessage}
					</p>
					<button
						type="button"
						class="mt-2 inline-flex items-center rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors duration-150 ease-out hover:bg-background-inset"
						onclick={controller.retryRuntime}
					>
						Retry runtime
					</button>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
	.playground-workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		transition: grid-template-columns 240ms cubic-bezier(0.2, 0, 0, 1);
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
			background: var(--color-border);
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
			border-left-color: color-mix(in srgb, currentColor 25%, transparent);
			opacity: 1;
		}

		.panel-resizer--hidden {
			pointer-events: none;
		}

		.panel-resizer--hidden::before {
			opacity: 0;
		}
	}

	@media (max-width: 1023px) {
		.playground-workspace {
			grid-template-rows: var(--playground-rows);
			transition: grid-template-rows 240ms cubic-bezier(0.2, 0, 0, 1);
		}

		.playground-sidebar--collapsed {
			pointer-events: none;
			opacity: 0;
		}

		.playground-sidebar {
			transition: opacity 240ms cubic-bezier(0.2, 0, 0, 1);
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
			'Aeonik Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
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

	:global(.cm-editor .cm-lineNumbers .cm-gutterElement) {
		min-width: 3ch;
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
