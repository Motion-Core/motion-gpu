<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import { defineMaterial } from '../../../src/lib/core/material';
	import { ShaderPass, ComputePass } from '../../../src/lib/passes';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import type { AnyPass } from '../../../src/lib/core/types';
	import RuntimeProbe, { type RuntimeControls } from '../RuntimeProbe.svelte';

	const materialWithStorage = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
		storageBuffers: {
			data: { type: 'array<f32>', size: 256, access: 'read-write' }
		}
	});

	/* ───── shader passes ───── */

	const redShiftPass = new ShaderPass({
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.r + 0.3, inputColor.g * 0.7, inputColor.b * 0.7, inputColor.a);
}
`
	});

	const greenShiftPass = new ShaderPass({
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.r * 0.7, inputColor.g + 0.3, inputColor.b * 0.7, inputColor.a);
}
`
	});

	const blueShiftPass = new ShaderPass({
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.r * 0.7, inputColor.g * 0.7, inputColor.b + 0.3, inputColor.a);
}
`
	});

	const badShaderPass = new ShaderPass({
		fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(UNDEFINED_VALUE.rgb, 1.0);
}
`
	});

	/* ───── compute pass ───── */

	const computePass = new ComputePass({
		compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.01;
	}
}
`,
		dispatch: [4, 1, 1]
	});

	type PassConfig =
		| 'none'
		| 'single-shader'
		| 'chain-3'
		| 'compute-only'
		| 'compute-plus-shader'
		| 'toggle-middle'
		| 'bad-shader-pass'
		| 'multi-error';

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<RuntimeControls | null>(null);
	let frameCount = $state(0);
	let lastError = $state('none');
	let errorCount = $state(0);
	let passConfig = $state<PassConfig>('none');
	let activePasses = $state<AnyPass[]>([]);
	let passCount = $state(0);

	function applyConfig(config: PassConfig): void {
		passConfig = config;
		switch (config) {
			case 'none':
				activePasses = [];
				break;
			case 'single-shader':
				redShiftPass.enabled = true;
				activePasses = [redShiftPass];
				break;
			case 'chain-3':
				redShiftPass.enabled = true;
				greenShiftPass.enabled = true;
				blueShiftPass.enabled = true;
				activePasses = [redShiftPass, greenShiftPass, blueShiftPass];
				break;
			case 'compute-only':
				computePass.enabled = true;
				activePasses = [computePass];
				break;
			case 'compute-plus-shader':
				computePass.enabled = true;
				redShiftPass.enabled = true;
				activePasses = [computePass, redShiftPass];
				break;
			case 'toggle-middle':
				redShiftPass.enabled = true;
				greenShiftPass.enabled = false;
				blueShiftPass.enabled = true;
				activePasses = [redShiftPass, greenShiftPass, blueShiftPass];
				break;
			case 'bad-shader-pass':
				badShaderPass.enabled = true;
				activePasses = [badShaderPass];
				break;
			case 'multi-error':
				badShaderPass.enabled = true;
				activePasses = [badShaderPass];
				break;
		}
		passCount = activePasses.length;
	}

	function toggleMiddlePass(): void {
		greenShiftPass.enabled = !greenShiftPass.enabled;
		activePasses = [...activePasses];
	}

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
		<div data-testid="last-error">{lastError}</div>
		<div data-testid="error-count">{errorCount}</div>
		<div data-testid="pass-config">{passConfig}</div>
		<div data-testid="pass-count">{passCount}</div>

		<button data-testid="set-config-none" onclick={() => applyConfig('none')}>none</button>
		<button data-testid="set-config-single-shader" onclick={() => applyConfig('single-shader')}>single shader</button>
		<button data-testid="set-config-chain-3" onclick={() => applyConfig('chain-3')}>chain 3</button>
		<button data-testid="set-config-compute-only" onclick={() => applyConfig('compute-only')}>compute only</button>
		<button data-testid="set-config-compute-plus-shader" onclick={() => applyConfig('compute-plus-shader')}>compute+shader</button>
		<button data-testid="set-config-toggle-middle" onclick={() => applyConfig('toggle-middle')}>toggle middle</button>
		<button data-testid="set-config-bad-shader-pass" onclick={() => applyConfig('bad-shader-pass')}>bad shader pass</button>
		<button data-testid="set-config-multi-error" onclick={() => applyConfig('multi-error')}>multi error</button>

		<button data-testid="toggle-middle-pass" onclick={toggleMiddlePass}>toggle green pass</button>
		<button data-testid="advance-once" onclick={() => controls?.advance()}>advance</button>
		<button data-testid="set-mode-always" onclick={() => { controls?.setRenderMode('always'); }}>always</button>
		<button data-testid="set-mode-manual" onclick={() => { controls?.setRenderMode('manual'); }}>manual</button>
	</section>

	<div class="canvas-shell">
		<FragCanvas material={materialWithStorage} passes={activePasses} showErrorOverlay={false} onError={handleError}>
			<RuntimeProbe
				onFrame={(count) => { frameCount = count; }}
				onReady={(nextControls) => {
					controls = nextControls;
					nextControls.setRenderMode('manual');
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
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
