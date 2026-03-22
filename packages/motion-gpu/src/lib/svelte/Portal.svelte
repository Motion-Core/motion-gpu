<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		target?: string | HTMLElement | null;
		children?: Snippet;
	}

	let { target = 'body', children }: Props = $props();

	function resolveTargetElement(input: string | HTMLElement | null | undefined): HTMLElement {
		return typeof input === 'string'
			? (document.querySelector<HTMLElement>(input) ?? document.body)
			: (input ?? document.body);
	}

	const portal = (node: HTMLDivElement) => {
		const targetElement = resolveTargetElement(target);
		targetElement.appendChild(node);

		return () => {
			if (node.parentNode === targetElement) {
				targetElement.removeChild(node);
			}
		};
	};
</script>

<div {@attach portal}>
	{@render children?.()}
</div>
