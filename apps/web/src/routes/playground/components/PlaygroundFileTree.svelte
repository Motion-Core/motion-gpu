<script lang="ts">
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
	import Document from 'carbon-icons-svelte/lib/Document.svelte';
	import Folder from 'carbon-icons-svelte/lib/Folder.svelte';
	import LogoSvelte from 'carbon-icons-svelte/lib/LogoSvelte.svelte';
	import { brandingConfig } from '$lib/config/branding';

	import type { PlaygroundController } from '../playground-controller.svelte';

	let {
		controller,
		isTreeVisible,
		onHeaderHostChange,
		onListHostChange
	}: {
		controller: PlaygroundController;
		isTreeVisible: boolean;
		onHeaderHostChange: (host: HTMLDivElement | null) => void;
		onListHostChange: (host: HTMLDivElement | null) => void;
	} = $props();

	const isSvelteFile = (path: string) => path.endsWith('.svelte');

	const registerSidebarHeaderHost = (node: HTMLDivElement) => {
		onHeaderHostChange(node);
		return {
			destroy() {
				onHeaderHostChange(null);
			}
		};
	};

	const registerSidebarListHost = (node: HTMLDivElement) => {
		onListHostChange(node);
		return {
			destroy() {
				onListHostChange(null);
			}
		};
	};
</script>

<aside
	inert={!isTreeVisible}
	aria-hidden={!isTreeVisible}
	class={`playground-sidebar flex min-h-0 flex-col overflow-hidden bg-background lg:max-h-none ${
		isTreeVisible ? '' : 'playground-sidebar--collapsed'
	}`}
>
	<div
		use:registerSidebarHeaderHost
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
	<div use:registerSidebarListHost class="overflow-auto py-1 lg:min-h-0 lg:flex-1">
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

<style>
	@media (max-width: 1023px) {
		.playground-sidebar--collapsed {
			pointer-events: none;
			opacity: 0;
		}

		.playground-sidebar {
			transition: opacity 240ms cubic-bezier(0.2, 0, 0, 1);
		}
	}
</style>
