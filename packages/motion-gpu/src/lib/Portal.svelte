<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		target?: string | HTMLElement | null;
		children?: Snippet;
	}

	let { target = 'body', children }: Props = $props();
	let element = $state<HTMLDivElement | null>(null);

	onMount(() => {
		if (!element) {
			return;
		}

		const targetElement =
			typeof target === 'string'
				? (document.querySelector<HTMLElement>(target) ?? document.body)
				: (target ?? document.body);

		targetElement.appendChild(element);

		return () => {
			if (element?.parentNode === targetElement) {
				targetElement.removeChild(element);
			}
		};
	});
</script>

<div bind:this={element}>
	{@render children?.()}
</div>
