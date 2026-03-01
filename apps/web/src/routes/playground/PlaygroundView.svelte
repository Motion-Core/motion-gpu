<script lang="ts">
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import Document from 'carbon-icons-svelte/lib/Document.svelte';
	import Folder from 'carbon-icons-svelte/lib/Folder.svelte';
	import LogoSvelte from 'carbon-icons-svelte/lib/LogoSvelte.svelte';
	import OpenPanelFilledLeft from 'carbon-icons-svelte/lib/OpenPanelFilledLeft.svelte';
	import OpenPanelLeft from 'carbon-icons-svelte/lib/OpenPanelLeft.svelte';

	import 'monaco-editor/min/vs/editor/editor.main.css';
	import type { PlaygroundController } from './playground-controller.svelte';

	let { controller }: { controller: PlaygroundController } = $props();
	let isTreeVisible = $state(true);

	const isSvelteFile = (path: string) => path.endsWith('.svelte');

	const workspaceColumns = $derived(
		isTreeVisible ? '16rem minmax(0,1fr) minmax(0,0.92fr)' : '0rem minmax(0,1fr) minmax(0,0.92fr)'
	);
	const toggleTree = () => {
		isTreeVisible = !isTreeVisible;
	};
</script>

<main class="h-dvh overflow-hidden p-2 sm:p-4 lg:p-8">
	<section class="flex h-full min-h-0 flex-col">
		<header class="flex items-center justify-between gap-3 pb-3 sm:gap-4 sm:pb-4">
			<div class="flex min-w-0 items-center gap-3 sm:gap-4">
				<span
					class="inline-flex shrink-0 items-center text-accent [&>svg]:size-7 [&>svg]:fill-current sm:[&>svg]:size-8 lg:[&>svg]:size-10"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html Logo}
				</span>
				<h1 class="text-lg tracking-tight text-balance sm:text-2xl lg:text-3xl">
					Motion GPU <span class="text-accent">playground</span>
				</h1>
			</div>
		</header>

		<section class="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden border border-border lg:mt-4">
			<div
				class="flex h-9 items-center justify-between border-b border-border bg-card px-2 sm:px-3"
			>
				<p class="text-xs text-foreground-muted">Workspace</p>
				<div class="flex items-center gap-1">
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
				class="playground-workspace min-h-0 flex-1"
				style={`--playground-columns: ${workspaceColumns};`}
			>
				<aside
					class={`flex min-h-0 flex-col overflow-hidden bg-card lg:max-h-none ${
						isTreeVisible ? 'lg:border-r lg:border-border' : 'lg:border-r-0'
					}`}
				>
					<div class="border-b border-border px-3 py-2">
						<p class="text-xs text-foreground-muted">Files</p>
					</div>
					<div class="min-h-0 flex-1 overflow-auto py-1">
						{#each controller.visibleFileTreeRows as row (row.path)}
							{#if row.kind === 'directory'}
								<button
									type="button"
									onclick={() => controller.toggleDirectory(row.path)}
									class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-foreground-muted transition-colors hover:bg-background-muted/55 hover:text-foreground"
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
									class={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors ${
										controller.activeFilePath === row.path
											? 'bg-background-muted text-foreground'
											: 'text-foreground-muted hover:bg-background-muted/55 hover:text-foreground'
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

				<section class="flex min-h-0 flex-col bg-card lg:border-r lg:border-border">
					<div class="h-8 border-b border-border">
						<div class="flex items-stretch overflow-x-auto">
							{#each controller.openFilePaths as filePath (filePath)}
								<div
									class={`group inline-flex shrink-0 items-center border-r border-border ${
										controller.activeFilePath === filePath ? 'bg-white' : 'bg-background'
									}`}
								>
									<button
										type="button"
										onclick={() => controller.switchToFile(filePath)}
										class={`px-2.5 py-2 text-left font-mono text-[11px] transition-colors sm:px-3 sm:text-xs ${
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
											class="inline-flex items-center px-3 py-2 text-foreground-muted transition-colors hover:text-foreground"
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
						bind:this={controller.editorHost}
						class="min-h-0 flex-1 bg-white"
						aria-label="Svelte component editor"
					></div>

					{#if controller.syncError}
						<p
							class="border-t border-border bg-card px-3 py-2 font-mono text-xs text-red-500"
							role="alert"
						>
							{controller.syncError}
						</p>
					{/if}

					<section class="border-t border-border bg-card">
						{#if controller.runtimeLog}
							<details>
								<summary class="cursor-pointer px-3 py-2 font-mono text-xs text-foreground-muted">
									Runtime log ({controller.status})
								</summary>
								<pre
									class="max-h-32 overflow-auto border-t border-border bg-white px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap text-foreground-muted">{controller.runtimeLogTail}</pre>
							</details>
						{:else}
							<p class="border-t border-border px-3 py-2 font-mono text-xs text-foreground-muted">
								{controller.status}
							</p>
						{/if}
					</section>
				</section>

				<section class="flex min-h-0 flex-col overflow-hidden bg-card">
					<div class="relative min-h-0 flex-1 bg-card">
						{#if controller.previewUrl}
							<iframe
								title="WebContainer preview"
								src={controller.previewUrl}
								class="h-full w-full border-0"
								loading="eager"
							></iframe>
						{:else}
							<div
								class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-foreground-muted"
							>
								Booting runtime and waiting for preview...
							</div>
						{/if}
					</div>

					{#if controller.errorMessage}
						<p
							class="border-t border-border bg-card px-3 py-2 font-mono text-xs whitespace-pre-wrap text-red-500"
							role="alert"
						>
							{controller.errorMessage}
						</p>
					{/if}
				</section>
			</div>
		</section>
	</section>
</main>

<style>
	.playground-workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		transition: grid-template-columns 240ms cubic-bezier(0.2, 0, 0, 1);
	}

	@media (min-width: 1024px) {
		.playground-workspace {
			grid-template-columns: var(--playground-columns);
		}
	}

	@media (max-width: 1023px) {
		.playground-workspace {
			grid-template-rows: repeat(3, minmax(0, 1fr));
			transition: grid-template-rows 240ms cubic-bezier(0.2, 0, 0, 1);
		}
	}

	:global(.monaco-editor, .monaco-editor .view-lines, .monaco-editor .inputarea) {
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
</style>
