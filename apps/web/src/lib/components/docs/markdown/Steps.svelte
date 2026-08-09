<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';

	let {
		class: className,
		children
	}: {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<div
	class={cn(
		"relative mb-12 ml-4 space-y-10 [counter-reset:step] before:absolute before:inset-y-0 before:left-0 before:w-px before:guide before:content-['']",
		className
	)}
>
	{@render children?.()}
</div>
