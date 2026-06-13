<script lang="ts">
	import FragCanvas from '../../lib/svelte/FragCanvas.svelte';
	import type { FragMaterial } from '../../lib/core/material';

	interface Props {
		material: FragMaterial;
		onCanvas?: (canvas: HTMLCanvasElement | undefined) => void;
	}

	let { material, onCanvas }: Props = $props();
	let canvas = $state<HTMLCanvasElement | undefined>();

	$effect(() => {
		onCanvas?.(canvas);
	});
</script>

<FragCanvas
	{material}
	bind:canvas
	class="bound-canvas"
	data-testid="bound-canvas"
	showErrorOverlay={false}
/>
