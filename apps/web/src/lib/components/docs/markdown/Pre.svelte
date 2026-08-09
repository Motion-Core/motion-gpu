<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import ScrollArea from '$lib/components/ui/ScrollArea.svelte';
	import CopyCodeButton from './CopyCodeButton.svelte';

	type ComponentProps = {
		class?: string;
		children?: Snippet;
		code?: string;
		unstyled?: boolean;
		scrollable?: boolean;
		scrollThumbTabbable?: boolean;
		scrollViewportTabbable?: boolean;
		[prop: string]: unknown;
	};

	const props = $props();
	const className = $derived((props as ComponentProps).class ?? '');
	const code = $derived((props as ComponentProps).code ?? '');
	const unstyled = $derived((props as ComponentProps).unstyled ?? false);
	const scrollable = $derived((props as ComponentProps).scrollable ?? true);
	const scrollThumbTabbable = $derived((props as ComponentProps).scrollThumbTabbable ?? false);
	const scrollViewportTabbable = $derived((props as ComponentProps).scrollViewportTabbable ?? true);
	const children = $derived((props as ComponentProps).children);
	const restProps = $derived.by(() => {
		const {
			class: _class,
			children: _children,
			code: _code,
			unstyled: _unstyled,
			scrollable: _scrollable,
			scrollThumbTabbable: _scrollThumbTabbable,
			scrollViewportTabbable: _scrollViewportTabbable,
			...rest
		} = props as ComponentProps;
		return rest;
	});
</script>

<div class="card-outer mt-8 rounded-lg bg-background-inset p-1.5">
	<div
		{...restProps}
		class={cn(
			unstyled
				? 'group/pre relative font-mono text-base font-normal'
				: 'group/pre relative rounded-md bg-background p-4 font-mono text-base font-normal text-foreground card',
			className
		)}
	>
		{#if scrollable}
			<ScrollArea
				mode="horizontal"
				class="w-full"
				thumbTabbable={scrollThumbTabbable}
				viewportTabbable={scrollViewportTabbable}
			>
				{@render children?.()}
			</ScrollArea>
		{:else}
			{@render children?.()}
		{/if}
		{#if code}
			<div class="pointer-events-none absolute top-2 right-2 z-10">
				<CopyCodeButton {code} class="pointer-events-auto" />
			</div>
		{/if}
	</div>
</div>

<style>
	:global(.shiki) {
		background-color: transparent !important;
		font-size: 14px;
		font-weight: 400;
	}
</style>
