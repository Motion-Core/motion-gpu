<script lang="ts">
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import { defineMaterial } from '../../../src/lib/core/material';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.0, 1.0);
}
`
	});

	let showCanvases = $state(false);
	let reportedErrors = $state(0);
</script>

<main data-testid="error-overlay-stack-root">
	<button data-testid="open-error-overlays" onclick={() => (showCanvases = true)}>
		Open error overlays
	</button>
	<div data-testid="reported-errors">{reportedErrors}</div>

	{#if showCanvases}
		<div class="canvas-shell">
			<FragCanvas {material} onError={() => (reportedErrors += 1)} />
		</div>
		<div class="canvas-shell">
			<FragCanvas {material} onError={() => (reportedErrors += 1)} />
		</div>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.canvas-shell {
		width: 16rem;
		height: 10rem;
	}
</style>
