<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils/cn';

	type ComponentProps = {
		label: string;
		title: string;
		href: string;
		align?: 'left' | 'right';
		forceSecondColumn?: boolean;
	};

	const {
		label,
		title,
		href,
		align = 'left',
		forceSecondColumn = false
	}: ComponentProps = $props();
</script>

<div
	class={cn(
		'group card-outer rounded-lg bg-background-inset p-1.5',
		align === 'right' && 'sm:text-right',
		forceSecondColumn && 'sm:col-start-2'
	)}
>
	<a
		// @ts-expect-error arg cannot be cast as `resolve`s expected type
		href={resolve(href)}
		class={cn(
			'focus-ring focus-outline group relative flex flex-col rounded-md bg-background px-4 py-3 card transition-[background-color,box-shadow] duration-150 ease-out outline-none hover:bg-background-muted motion-reduce:transition-none'
		)}
	>
		<span class="text-xs font-normal tracking-wide text-foreground-muted/70 uppercase">
			{label}
		</span>
		<span class="text-lg font-medium tracking-tight text-foreground">
			{title}
		</span>
	</a>
</div>
