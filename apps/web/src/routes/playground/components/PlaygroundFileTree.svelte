<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import ChevronRight from 'carbon-icons-svelte/lib/ChevronRight.svelte';
	import Document from 'carbon-icons-svelte/lib/Document.svelte';
	import Folder from 'carbon-icons-svelte/lib/Folder.svelte';
	import LogoSvelte from 'carbon-icons-svelte/lib/LogoSvelte.svelte';
	import { brandingConfig } from '$lib/config/branding';

	import type { PlaygroundController } from '../playground-controller.svelte';

	let {
		controller,
		onHeaderHostChange,
		onListHostChange
	}: {
		controller: PlaygroundController;
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

<aside class="playground-sidebar flex min-h-0 flex-col lg:max-h-none">
	<div use:registerSidebarHeaderHost class="border-b border-border px-1 py-2">
		<a
			href={resolve('/' as const)}
			class="inline-flex min-w-0 items-center gap-2 whitespace-nowrap text-accent [&>svg]:size-5 [&>svg]:fill-current"
			aria-label="Back to Home"
			title="Back to Home"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html brandingConfig.logoRaw}
			<span class="text-sm leading-none font-medium tracking-tight text-foreground">
				{brandingConfig.name}
			</span>
		</a>
	</div>
	<div use:registerSidebarListHost class="flex flex-col gap-0.5 overflow-auto lg:min-h-0 lg:flex-1">
		<div
			class="flex h-8 items-center gap-1 border-b border-border px-2 py-2 text-xs tracking-normal whitespace-nowrap text-foreground-muted"
		>
			File explorer
		</div>
		{#each controller.visibleFileTreeRows as row (row.path)}
			{#if row.kind === 'directory'}
				<button
					type="button"
					onclick={() => controller.toggleDirectory(row.path)}
					class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-normal text-foreground-muted hover:bg-foreground-muted/10 hover:text-foreground"
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
					class={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-normal ${
						controller.activeFilePath === row.path
							? 'bg-foreground-muted/10 text-foreground'
							: 'text-foreground-muted hover:bg-foreground-muted/10 hover:text-foreground'
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
