<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import { defineMaterial, type FragMaterial } from '../../../src/lib/core/material';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import UniformProbe, { type UniformProbeControls } from './UniformProbe.svelte';

	const materialWithUniform = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(motiongpuUniforms.brightness * uv.x, 0.1, 0.2, 1.0);
}
`,
		uniforms: {
			brightness: 0.5
		}
	});

	const materialAlternate = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(0.1, motiongpuUniforms.brightness * uv.y, 0.8, 1.0);
}
`,
		uniforms: {
			brightness: 0.5
		}
	});

	const materialWithDefinesOn = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	if USE_ALTERNATE {
		return vec4f(0.0, 0.0, 1.0, 1.0);
	}
	return vec4f(1.0, 0.0, 0.0, 1.0);
}
`,
		defines: {
			USE_ALTERNATE: true
		}
	});

	const materialWithDefinesOff = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	if USE_ALTERNATE {
		return vec4f(0.0, 0.0, 1.0, 1.0);
	}
	return vec4f(1.0, 0.0, 0.0, 1.0);
}
`,
		defines: {
			USE_ALTERNATE: false
		}
	});

	type MaterialMode = 'uniform-a' | 'uniform-b' | 'defines-on' | 'defines-off';

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<UniformProbeControls | null>(null);
	let frameCount = $state(0);
	let lastError = $state('none');
	let materialMode = $state<MaterialMode>('uniform-a');
	let brightnessLevel = $state<'low' | 'high'>('low');
	let activeMaterial = $state<FragMaterial>(materialWithUniform);
	let uniformValue = $state<number>(0.5);
	let uniformName = $state<string | null>('brightness');

	function setMaterialMode(mode: MaterialMode): void {
		materialMode = mode;
		switch (mode) {
			case 'uniform-a':
				activeMaterial = materialWithUniform;
				uniformName = 'brightness';
				break;
			case 'uniform-b':
				activeMaterial = materialAlternate;
				uniformName = 'brightness';
				break;
			case 'defines-on':
				activeMaterial = materialWithDefinesOn;
				uniformName = null;
				break;
			case 'defines-off':
				activeMaterial = materialWithDefinesOff;
				uniformName = null;
				break;
		}
	}

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
		<div data-testid="last-error">{lastError}</div>
		<div data-testid="material-mode">{materialMode}</div>
		<div data-testid="brightness-level">{brightnessLevel}</div>

		<button data-testid="set-material-a" onclick={() => setMaterialMode('uniform-a')}
			>material A</button
		>
		<button data-testid="set-material-b" onclick={() => setMaterialMode('uniform-b')}
			>material B</button
		>
		<button data-testid="set-material-defines-on" onclick={() => setMaterialMode('defines-on')}
			>defines ON</button
		>
		<button data-testid="set-material-defines-off" onclick={() => setMaterialMode('defines-off')}
			>defines OFF</button
		>

		<button
			data-testid="set-brightness-high"
			onclick={() => {
				brightnessLevel = 'high';
				uniformValue = 1.0;
			}}
		>
			brightness high
		</button>
		<button
			data-testid="set-brightness-low"
			onclick={() => {
				brightnessLevel = 'low';
				uniformValue = 0.1;
			}}
		>
			brightness low
		</button>

		<button data-testid="advance-once" onclick={() => controls?.advance()}>advance</button>
	</section>

	<div class="canvas-shell">
		<FragCanvas material={activeMaterial} showErrorOverlay={false} onError={handleError}>
			<UniformProbe
				onFrame={(count) => {
					frameCount = count;
				}}
				onReady={(nextControls) => {
					controls = nextControls;
					nextControls.setRenderMode('manual');
				}}
				{uniformName}
				{uniformValue}
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
