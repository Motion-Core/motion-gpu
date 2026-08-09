<script lang="ts">
	import { searchState } from '$lib/stores/search.svelte';
	import { contentUiDefaults, type SectionUiConfig } from '$lib/config/content-ui';
	import { cn } from '$lib/utils/cn';
	import { AppSearchIcon } from '$lib/components/icons';

	let {
		class: className,
		searchConfig = contentUiDefaults.search
	}: { class?: string; searchConfig?: SectionUiConfig['search'] } = $props();
</script>

{#if searchConfig.enabled}
	<div class={cn('inset-shadow relative h-9 w-full rounded-sm bg-background-inset', className)}>
		<button
			type="button"
			class="focus-ring group absolute inset-0 flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium text-foreground-muted/70 transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
			onclick={() => {
				searchState.open();
			}}
		>
			<AppSearchIcon size={16} class="text-foreground-muted/70" />
			<span class="flex-1 text-left">{searchConfig.triggerPlaceholder}</span>
			{#if searchConfig.hotkey.enabled}
				<kbd
					class="pointer-events-none relative hidden h-5 items-center gap-1 rounded-xs bg-background px-1.5 font-mono text-[10px] font-medium text-foreground-muted/70 card select-none sm:flex"
				>
					{searchConfig.hotkey.label}
				</kbd>
			{/if}
		</button>
	</div>
{/if}
