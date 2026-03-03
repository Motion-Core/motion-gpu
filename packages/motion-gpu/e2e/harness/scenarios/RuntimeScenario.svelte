<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/FragCanvas.svelte';
	import { defineMaterial } from '../../../src/lib/core/material';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import type { OutputColorSpace, RenderMode } from '../../../src/lib/core/types';
	import RuntimeProbe, { type RuntimeControls } from '../RuntimeProbe.svelte';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	let pulse = fract(motiongpuFrame.time * 0.5);
	return vec4f(pulse, 0.1, 0.2, 1.0);
}
`
	});

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let frameCount = $state(0);
	let renderMode = $state<RenderMode>('always');
	let outputColorSpace = $state<OutputColorSpace>('srgb');
	let lastError = $state('none');
	let controls = $state<RuntimeControls | null>(null);

	const setMode = (mode: RenderMode): void => {
		if (!controls) {
			return;
		}

		controls.setRenderMode(mode);
		renderMode = mode;
	};

	const handleError = (report: MotionGPUErrorReport): void => {
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
		<div data-testid="render-mode">{renderMode}</div>
		<div data-testid="output-color-space">{outputColorSpace}</div>
		<div data-testid="last-error">{lastError}</div>

		<button data-testid="set-mode-always" onclick={() => setMode('always')}>always</button>
		<button data-testid="set-mode-on-demand" onclick={() => setMode('on-demand')}>on-demand</button>
		<button data-testid="set-mode-manual" onclick={() => setMode('manual')}>manual</button>
		<button data-testid="invalidate-once" onclick={() => controls?.invalidate()}>invalidate</button>
		<button data-testid="advance-once" onclick={() => controls?.advance()}>advance</button>
		<button
			data-testid="toggle-output-color-space"
			onclick={() => {
				outputColorSpace = outputColorSpace === 'srgb' ? 'linear' : 'srgb';
			}}
		>
			toggle output
		</button>
	</section>

	<div class="canvas-shell">
		<FragCanvas {material} {outputColorSpace} showErrorOverlay={false} onError={handleError}>
			<RuntimeProbe
				onFrame={(count) => {
					frameCount = count;
				}}
				onReady={(nextControls) => {
					controls = nextControls;
					setMode(renderMode);
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
