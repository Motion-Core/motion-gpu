<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { cva, type VariantProps } from 'class-variance-authority';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';

	const buttonVariants = cva(
		'inline-flex items-center justify-center gap-2 whitespace-nowrap font-normal text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		{
			variants: {
				variant: {
					primary: 'bg-foreground text-background hover:bg-foreground/90',
					brand: 'bg-accent text-background hover:bg-accent/90',
					secondary: 'bg-background-muted text-foreground hover:bg-background',
					outline: 'border border-border text-foreground hover:bg-background',
					ghost: 'text-foreground hover:bg-background',
					link: 'h-auto p-0 text-foreground underline-offset-4 hover:underline'
				},
				size: {
					sm: 'h-7 px-2.5 text-xs',
					md: 'h-8 px-2.5',
					lg: 'h-9 px-2.5',
					icon: 'size-8 p-0',
					none: ''
				}
			},
			defaultVariants: {
				variant: 'primary',
				size: 'md'
			}
		}
	);

	type ButtonVariants = VariantProps<typeof buttonVariants>;

	interface Props extends ButtonVariants {
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		href,
		type = 'button',
		disabled = false,
		variant = 'primary',
		size = 'md',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const classes = $derived(cn(buttonVariants({ variant, size }), className));
</script>

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a
		href={disabled ? undefined : href}
		class={classes}
		aria-disabled={disabled || undefined}
		tabindex={disabled ? -1 : undefined}
		{...rest}
	>
		{@render children?.()}
	</a>
{:else}
	<button {type} class={classes} {disabled} {...rest}>
		{@render children?.()}
	</button>
{/if}
