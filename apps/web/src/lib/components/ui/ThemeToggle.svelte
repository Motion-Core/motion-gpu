<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { AppMoonIcon, AppSunIcon } from '$lib/components/icons';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';

	type Props = {
		class?: string;
		tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
	};

	const props = $props();
	const className = $derived((props as Props).class ?? '');
	const tooltipSide = $derived((props as Props).tooltipSide ?? 'top');
	const ariaLabel = $derived(themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode');
</script>

<Tooltip content={ariaLabel} side={tooltipSide}>
	{#snippet children({ describedBy })}
		<div class="flex size-8 items-center justify-center">
			<button
				type="button"
				class={cn(
					'focus-ring focus-outline hit-target-compact group inset-shadow relative inline-flex size-7 items-center justify-center rounded-sm bg-background-inset text-foreground transition-[scale,box-shadow] duration-150 ease-out outline-none active:scale-[0.95] motion-reduce:transform-none motion-reduce:transition-none',
					className
				)}
				onclick={themeStore.toggle}
				aria-label={ariaLabel}
				aria-describedby={describedBy}
				aria-pressed={themeStore.isDark}
			>
				<span class="sr-only">{ariaLabel}</span>
				<span class="theme-toggle-icon theme-toggle-sun">
					<AppSunIcon size={16} />
				</span>
				<span class="theme-toggle-icon theme-toggle-moon">
					<AppMoonIcon size={16} />
				</span>
			</button>
		</div>
	{/snippet}
</Tooltip>

<style>
	.theme-toggle-icon {
		position: absolute;
		opacity: 0;
		filter: blur(4px);
		scale: 0.25;
		transition:
			opacity 150ms ease-out,
			filter 150ms ease-out,
			scale 150ms ease-out;
		will-change: opacity, filter, scale;
	}

	@media (prefers-reduced-motion: reduce) {
		.theme-toggle-icon {
			filter: none;
			scale: 1;
			transition: none;
			will-change: auto;
		}
	}

	.theme-toggle-sun {
		opacity: 1;
		filter: blur(0);
		scale: 1;
	}

	:global(.dark) .theme-toggle-sun {
		opacity: 0;
		filter: blur(4px);
		scale: 0.25;
	}

	:global(.dark) .theme-toggle-moon {
		opacity: 1;
		filter: blur(0);
		scale: 1;
	}
</style>
