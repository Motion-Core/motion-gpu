<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import { defineMaterial, type FragMaterial } from '../../../src/lib/core/material';
	import type { SpektralErrorReport } from '../../../src/lib/core/error-report';
	import type { AnyPass, RenderTargetDefinitionMap } from '../../../src/lib/core/types';
	import { PingPongShaderPass, ShaderPass } from '../../../src/lib/passes';
	import RuntimeProbe, { type RuntimeControls } from '../RuntimeProbe.svelte';

	const contextMaterial = defineMaterial({
		fragment: `
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn frag(uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(contextUv * 0.6, distance(contextUv, uv), 1.0);
}
`,
		textures: {
			fluid: { format: 'rgba16float', filter: 'nearest' }
		}
	});

	const feedbackMaterial = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return textureSample(fluid, fluidSampler, uv);
}
`,
		textures: {
			fluid: { format: 'rgba16float', filter: 'nearest' }
		}
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
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(contextUv.x, contextUv.y * 0.8, distance(contextUv, uv), inputColor.a);
}
`
	});

	const namedReadPass = new ShaderPass({
		needsSwap: false,
		input: 'fxMain',
		output: 'canvas',
		fragment: `
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(inputColor.r * 0.9, contextUv.y * 0.8, distance(contextUv, uv), inputColor.a);
}
`
	});

	const feedbackPass = new PingPongShaderPass({
		target: 'fluid',
		width: 160,
		height: 110,
		format: 'rgba16float',
		filter: 'nearest',
		fragment: `
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn frag(uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(contextUv.x * 0.8, contextUv.y, distance(contextUv, uv), 1.0);
}
`
	});

	const renderTargets: RenderTargetDefinitionMap = {
		fxMain: { scale: 1 }
	};

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<RuntimeControls | null>(null);
	let frameCount = $state(0);
	let material = $state<FragMaterial>(contextMaterial);
	let passes = $state<AnyPass[]>([]);
	let passMode = $state<'none' | 'invert' | 'named' | 'feedback'>('none');
	let renderMode = $state<'always' | 'on-demand' | 'manual'>('manual');
	let lastError = $state('none');

	const handleError = (report: SpektralErrorReport): void => {
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
				material = contextMaterial;
				passes = [];
				passMode = 'none';
			}}
		>
			no pass
		</button>
		<button
			data-testid="set-pass-invert"
			onclick={() => {
				material = contextMaterial;
				passes = [invertPass];
				passMode = 'invert';
			}}
		>
			invert pass
		</button>
		<button
			data-testid="set-pass-named"
			onclick={() => {
				material = contextMaterial;
				passes = [namedWritePass, namedReadPass];
				passMode = 'named';
			}}
		>
			named pass
		</button>
		<button
			data-testid="set-pass-feedback"
			onclick={() => {
				material = feedbackMaterial;
				passes = [feedbackPass];
				passMode = 'feedback';
			}}
		>
			feedback pass
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
