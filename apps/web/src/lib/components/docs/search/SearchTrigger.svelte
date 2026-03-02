<script lang="ts">
	import { searchState } from '$lib/stores/search.svelte';
	import { cn } from '$lib/utils/cn';

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
	<svg
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		width="18"
		height="18"
		fill="currentColor"
		viewBox="0 0 256 256"
		class="text-foreground-muted"
	>
		<path
			d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"
		></path>
	</svg>
	<span class="text-sm text-foreground-muted">Search docs...</span>
	<span
		class="ml-auto hidden border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground-muted sm:inline"
		>⌘K</span
	>
</button>
