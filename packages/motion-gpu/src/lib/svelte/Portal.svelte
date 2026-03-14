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

	const portal = (node: HTMLDivElement, initialTarget: string | HTMLElement | null) => {
		let targetElement = resolveTargetElement(initialTarget);
		targetElement.appendChild(node);

		return {
			update(nextTarget: string | HTMLElement | null) {
				const nextTargetElement = resolveTargetElement(nextTarget);
				if (nextTargetElement === targetElement) {
					return;
				}

				if (node.parentNode === targetElement) {
					targetElement.removeChild(node);
				}

				nextTargetElement.appendChild(node);
				targetElement = nextTargetElement;
			},
			destroy() {
				if (node.parentNode === targetElement) {
					targetElement.removeChild(node);
				}
			}
		};
	};
</script>

<div use:portal={target}>
	{@render children?.()}
</div>
