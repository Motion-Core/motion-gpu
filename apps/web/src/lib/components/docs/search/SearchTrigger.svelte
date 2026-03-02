<script lang="ts">
	import { searchState } from '$lib/stores/search.svelte';
	import { cn } from '$lib/utils/cn';
	import Search from 'carbon-icons-svelte/lib/Search.svelte';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<button
	type="button"
	onclick={() => searchState.open()}
	class={cn(
		'flex h-8 w-full items-center gap-2 border border-border bg-card px-3 text-left',
		className
	)}
>
	<Search size={16} class="text-foreground-muted" aria-hidden="true" />
	<span class="text-sm text-foreground-muted">Search docs...</span>
	<span
		class="ml-auto hidden border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground-muted sm:inline"
		>⌘K</span
	>
</button>
