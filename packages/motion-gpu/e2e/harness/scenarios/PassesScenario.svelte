<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/FragCanvas.svelte';
	import { defineMaterial } from '../../../src/lib/core/material';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import type { RenderPass, RenderTargetDefinitionMap } from '../../../src/lib/core/types';
	import { ShaderPass } from '../../../src/lib/passes';
	import RuntimeProbe, { type RuntimeControls } from '../RuntimeProbe.svelte';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(0.2, 0.3, 0.4, 1.0);
}
`
	});

	const invertPass = new ShaderPass({
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(vec3f(1.0) - inputColor.rgb, inputColor.a);
}
`
	});

	const namedWritePass = new ShaderPass({
		needsSwap: false,
		output: 'fxMain',
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv.x + 0.2, uv.y + 0.3, 0.8), inputColor.a);
}
`
	});

	const namedReadPass = new ShaderPass({
		needsSwap: false,
		input: 'fxMain',
		output: 'canvas',
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.bgr, inputColor.a);
}
`
	});

	const renderTargets: RenderTargetDefinitionMap = {
		fxMain: { scale: 1 }
	};

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<RuntimeControls | null>(null);
	let frameCount = $state(0);
	let passes = $state<RenderPass[]>([]);
	let passMode = $state<'none' | 'invert' | 'named'>('none');
	let renderMode = $state<'always' | 'on-demand' | 'manual'>('manual');
	let lastError = $state('none');

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
		<div data-testid="last-error">{lastError}</div>
		<div data-testid="pass-mode">{passMode}</div>

		<button
			data-testid="set-pass-none"
			onclick={() => {
				passes = [];
				passMode = 'none';
			}}
		>
			no pass
		</button>
		<button
			data-testid="set-pass-invert"
			onclick={() => {
				passes = [invertPass];
				passMode = 'invert';
			}}
		>
			invert pass
		</button>
		<button
			data-testid="set-pass-named"
			onclick={() => {
				passes = [namedWritePass, namedReadPass];
				passMode = 'named';
			}}
		>
			named pass
		</button>
		<button data-testid="advance-once" onclick={() => controls?.advance()}>advance</button>
	</section>

	<div class="canvas-shell">
		<FragCanvas {material} {passes} {renderTargets} showErrorOverlay={false} onError={handleError}>
			<RuntimeProbe
				onFrame={(count) => {
					frameCount = count;
				}}
				onReady={(nextControls) => {
					controls = nextControls;
					nextControls.setRenderMode('manual');
					renderMode = 'manual';
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
