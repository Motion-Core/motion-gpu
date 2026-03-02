<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onDestroy } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn } from '$lib/utils/cn';
	import Copy from 'carbon-icons-svelte/lib/Copy.svelte';
	import Checkmark from 'carbon-icons-svelte/lib/Checkmark.svelte';

	interface Props {
		children?: Snippet;
		class?: string;
		code?: string;
		[key: string]: unknown;
	}

	let { children, class: className = '', code = '', ...rest }: Props = $props();
	let copied = $state(false);
	let timeoutId: number | null = null;
	let host: HTMLPreElement | null = null;

	async function handleCopy(value: string) {
		const fallback = host?.querySelector('code')?.textContent?.trim() ?? '';
		const toCopy = value || fallback;
		if (!toCopy || typeof navigator === 'undefined' || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(toCopy);
			copied = true;
			if (timeoutId) {
				window.clearTimeout(timeoutId);
			}
			timeoutId = window.setTimeout(() => {
				copied = false;
				timeoutId = null;
			}, 2000);
		} catch {}
	}

	onDestroy(() => {
		if (timeoutId) {
			window.clearTimeout(timeoutId);
			timeoutId = null;
		}
	});
</script>

<div class="relative">
	<pre
		bind:this={host}
		{...rest}
		data-md-pre
		class={`overflow-x-auto border border-border bg-background p-4 font-mono text-sm text-foreground ${className}`.trim()}>{@render children?.()}</pre>
	<Button
		type="button"
		variant="outline"
		size="icon"
		class="absolute top-2 right-2 bg-card hover:bg-card"
		onclick={(event: MouseEvent) => {
			event.stopPropagation();
			event.preventDefault();
			handleCopy(code);
		}}
		aria-label={copied ? 'Copied code' : 'Copy code'}
	>
		<span class="sr-only">{copied ? 'Copied code' : 'Copy code'}</span>
		<span class={cn('transition-transform duration-150 ease-out', copied && 'scale-0')}>
			<Copy aria-hidden="true" size={16} />
		</span>
		<span class={cn('absolute transition-transform duration-150 ease-out', !copied && 'scale-0')}>
			<Checkmark aria-hidden="true" size={16} />
		</span>
	</Button>
</div>

<style>
	:global(pre[data-md-pre] code) {
		background: transparent;
		padding: 0;
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.6;
	}
</style>
