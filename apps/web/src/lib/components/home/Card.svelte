<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';

	interface Props {
		number?: string;
		title: string;
		description: string;
		class?: string;
		icon?: Snippet;
	}

	let { number, title, description, class: className = '', icon }: Props = $props();
</script>

<article
	class={cn(
		'grid h-72 rounded-lg border border-border bg-background p-4 shadow-md sm:p-8',
		className
	)}
>
	<div class={cn('flex items-start', number ? 'justify-between' : 'justify-start')}>
		<div class="grid size-12 place-items-center text-accent">
			{@render icon?.()}
		</div>
		{#if number}
			<div class="font-mono text-base text-foreground-muted">
				{number}
			</div>
		{/if}
	</div>

	<div class="mt-auto grid gap-4">
		<h3 class="text-xl tracking-tight text-foreground">{title}</h3>
		<p class="text-base text-foreground-muted">{description}</p>
	</div>
</article>
