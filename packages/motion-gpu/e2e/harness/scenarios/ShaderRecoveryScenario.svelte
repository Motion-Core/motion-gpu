<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/FragCanvas.svelte';
	import { defineMaterial, type FragMaterial } from '../../../src/lib/core/material';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import RuntimeProbe, { type RuntimeControls } from '../RuntimeProbe.svelte';

	const goodMaterial = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	let pulse = fract(motiongpuFrame.time * 0.4);
	return vec4f(pulse, uv.y, 0.4, 1.0);
}
`
	});

	const badMaterial = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(missingValue.rgb, 1.0);
}
`
	});

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<RuntimeControls | null>(null);
	let frameCount = $state(0);
	let material = $state<FragMaterial>(goodMaterial);
	let errorCount = $state(0);
	let lastError = $state('none');

	const handleError = (report: MotionGPUErrorReport): void => {
		errorCount += 1;
		lastError = `${report.title}: ${report.rawMessage}`;
	};

	onMount(async () => {
		if (!navigator.gpu) {
			gpuStatus = 'unavailable';
			return;
		}

		try {
			const adapter = await navigator.gpu.requestAdapter();
			gpuStatus = adapter ? 'ready' : 'no-adapter';
		} catch {
			gpuStatus = 'no-adapter';
		}
	});
</script>

<main>
	<section class="controls">
		<div data-testid="gpu-status">{gpuStatus}</div>
		<div data-testid="controls-ready">{controls ? 'yes' : 'no'}</div>
		<div data-testid="frame-count">{frameCount}</div>
		<div data-testid="error-count">{errorCount}</div>
		<div data-testid="last-error">{lastError}</div>

		<button
			data-testid="set-bad-material"
			onclick={() => {
				material = badMaterial;
			}}
		>
			set bad material
		</button>
		<button
			data-testid="set-good-material"
			onclick={() => {
				material = goodMaterial;
			}}
		>
			set good material
		</button>
	</section>

	<div class="canvas-shell">
		<FragCanvas {material} showErrorOverlay={false} onError={handleError}>
			<RuntimeProbe
				onFrame={(count) => {
					frameCount = count;
				}}
				onReady={(nextControls) => {
					controls = nextControls;
					nextControls.setRenderMode('always');
				}}
			/>
		</FragCanvas>
	</div>
</main>

<style>
	main {
		font-family: sans-serif;
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	button {
		padding: 0.35rem 0.5rem;
		font: inherit;
	}

	.canvas-shell {
		width: 320px;
		height: 220px;
		border: 1px solid #d0d0d0;
	}
</style>
