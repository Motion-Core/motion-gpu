<script lang="ts">
	import { cn } from '../../utils/cn';

	type Props = {
		shinyWidth?: number;
		class?: string;
		children: import('svelte').Snippet;
	};

	let { shinyWidth = 100, class: className = '', children }: Props = $props();
</script>

<p
	style:--shiny-width="{shinyWidth}px"
	class={cn(
		'mx-auto max-w-md text-foreground-muted/70',
		'animate-shiny-text bg-size-[var(--shiny-width)_100%] bg-clip-text bg-position-[0_0] bg-no-repeat [transition:background-position_1s_cubic-bezier(.6,.6,0,1)_infinite]',
		'bg-linear-to-r from-transparent via-accent via-50% to-transparent',
		className
	)}
>
	{@render children()}
</p>
