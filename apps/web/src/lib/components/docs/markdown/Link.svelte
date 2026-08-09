<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';

	type ComponentProps = {
		class?: string;
		children?: Snippet;
		[prop: string]: unknown;
	};

	const { children, class: className = '', ...restProps }: ComponentProps = $props();
</script>

<a
	{...restProps}
	class={cn(
		'focus-ring rounded-xs text-base font-medium tracking-normal text-foreground underline decoration-dotted underline-offset-4 transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
		className
	)}
>
	{@render children?.()}
</a>
