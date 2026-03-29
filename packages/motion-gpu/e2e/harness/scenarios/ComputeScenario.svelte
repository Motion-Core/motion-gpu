<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import { defineMaterial } from '../../../src/lib/core/material';
	import { ComputePass, PingPongComputePass } from '../../../src/lib/passes';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import type { AnyPass } from '../../../src/lib/core/types';
	import RuntimeProbe, { type RuntimeControls } from '../RuntimeProbe.svelte';

	/* ───── materials ───── */

	/** Base material with a storage buffer for compute to write into. */
	const materialWithStorageBuffer = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
		storageBuffers: {
			data: { type: 'array<f32>', size: 256, access: 'read-write' }
		}
	});

	/** Material with a storage texture for compute to write into. */
	const materialWithStorageTexture = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
		textures: {
			computeOutput: {
				storage: true,
				format: 'rgba8unorm',
				width: 64,
				height: 64
			}
		}
	});

	/** Material for ping-pong compute. Includes a dummy storage buffer to ensure group(1) is bound. */
	const materialWithPingPong = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
		storageBuffers: {
			scratch: { type: 'array<f32>', size: 16, access: 'read-write' }
		},
		textures: {
			simulation: {
				storage: true,
				format: 'rgba8unorm',
				width: 64,
				height: 64
			}
		}
	});

	/** Material with time-dependent fragment for particle compute pass. */
	const materialMinimal = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	let t = motiongpuFrame.time;
	return vec4f(uv * sin(t * 0.5) * 0.5 + 0.5, 0.5, 1.0);
}
`,
		storageBuffers: {
			particles: { type: 'array<vec4f>', size: 1024, access: 'read-write' }
		}
	});

	/* ───── compute passes ───── */

	const basicComputePass = new ComputePass({
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

	const autoDispatchComputePass = new ComputePass({
		compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.02;
	}
}
`,
		dispatch: 'auto'
	});

	const dynamicDispatchComputePass = new ComputePass({
		compute: `
@compute @workgroup_size(16, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.03;
	}
}
`,
		dispatch: (ctx) => [Math.ceil(ctx.width / 16), 1, 1]
	});

	const disabledComputePass = new ComputePass({
		compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = 999.0;
	}
}
`,
		dispatch: [4, 1, 1],
		enabled: false
	});

	const storageTextureComputePass = new ComputePass({
		compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = vec2u(id.x, id.y);
	let dims = textureDimensions(computeOutput);
	if (pos.x < dims.x && pos.y < dims.y) {
		let uv = vec2f(f32(pos.x) / f32(dims.x), f32(pos.y) / f32(dims.y));
		textureStore(computeOutput, pos, vec4f(uv, 0.5, 1.0));
	}
}
`,
		dispatch: [8, 8, 1]
	});

	const pingPongComputePass = new PingPongComputePass({
		compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = id.xy;
	let dims = textureDimensions(simulationA);
	if (pos.x < dims.x && pos.y < dims.y) {
		let prev = textureLoad(simulationA, vec2i(pos), 0);
		let next = prev * 0.99 + vec4f(0.01, 0.0, 0.0, 0.0);
		textureStore(simulationB, pos, next);
	}
}
`,
		target: 'simulation',
		iterations: 1,
		dispatch: [8, 8, 1]
	});

	const pingPongMultiIterComputePass = new PingPongComputePass({
		compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = id.xy;
	let dims = textureDimensions(simulationA);
	if (pos.x < dims.x && pos.y < dims.y) {
		let prev = textureLoad(simulationA, vec2i(pos), 0);
		let next = prev * 0.98 + vec4f(0.02, 0.0, 0.0, 0.0);
		textureStore(simulationB, pos, next);
	}
}
`,
		target: 'simulation',
		iterations: 4,
		dispatch: [8, 8, 1]
	});

	const particleComputePass = new ComputePass({
		compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&particles)) {
		let t = motiongpuFrame.time;
		particles[idx] = vec4f(sin(t + f32(idx)), cos(t + f32(idx)), 0.0, 1.0);
	}
}
`,
		dispatch: [4, 1, 1]
	});

	const badComputePass = new ComputePass({
		compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = UNDEFINED_SYMBOL;
	}
}
`,
		dispatch: [1]
	});

	/* ───── state ───── */

	type ComputeMode =
		| 'none'
		| 'basic'
		| 'auto-dispatch'
		| 'dynamic-dispatch'
		| 'disabled'
		| 'storage-texture'
		| 'ping-pong'
		| 'ping-pong-multi'
		| 'particle'
		| 'bad-shader'
		| 'hot-swap'
		| 'toggle-enabled';

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<RuntimeControls | null>(null);
	let frameCount = $state(0);
	let lastError = $state('none');
	let errorCount = $state(0);
	let computeMode = $state<ComputeMode>('none');
	let renderMode = $state<'always' | 'on-demand' | 'manual'>('manual');

	let activePasses = $state<AnyPass[]>([]);
	let activeMaterial = $state(materialWithStorageBuffer);

	const handleError = (report: MotionGPUErrorReport): void => {
		errorCount += 1;
		lastError = `${report.title}: ${report.rawMessage}`;
	};

	function setComputeMode(mode: ComputeMode): void {
		computeMode = mode;

		switch (mode) {
			case 'none':
				activePasses = [];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'basic':
				activePasses = [basicComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'auto-dispatch':
				activePasses = [autoDispatchComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'dynamic-dispatch':
				activePasses = [dynamicDispatchComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'disabled':
				activePasses = [disabledComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'storage-texture':
				activePasses = [storageTextureComputePass];
				activeMaterial = materialWithStorageTexture;
				break;
			case 'ping-pong':
				activePasses = [pingPongComputePass];
				activeMaterial = materialWithPingPong;
				break;
			case 'ping-pong-multi':
				activePasses = [pingPongMultiIterComputePass];
				activeMaterial = materialWithPingPong;
				break;
			case 'particle':
				activePasses = [particleComputePass];
				activeMaterial = materialMinimal;
				break;
			case 'bad-shader':
				activePasses = [badComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'hot-swap':
				activePasses = [basicComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
			case 'toggle-enabled':
				basicComputePass.enabled = true;
				activePasses = [basicComputePass];
				activeMaterial = materialWithStorageBuffer;
				break;
		}
	}

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
		<div data-testid="error-count">{errorCount}</div>
		<div data-testid="compute-mode">{computeMode}</div>
		<div data-testid="pass-count">{activePasses.length}</div>

		<!-- mode buttons -->
		<button data-testid="set-compute-none" onclick={() => setComputeMode('none')}>none</button>
		<button data-testid="set-compute-basic" onclick={() => setComputeMode('basic')}>basic</button>
		<button data-testid="set-compute-auto-dispatch" onclick={() => setComputeMode('auto-dispatch')}>auto dispatch</button>
		<button data-testid="set-compute-dynamic-dispatch" onclick={() => setComputeMode('dynamic-dispatch')}>dynamic dispatch</button>
		<button data-testid="set-compute-disabled" onclick={() => setComputeMode('disabled')}>disabled</button>
		<button data-testid="set-compute-storage-texture" onclick={() => setComputeMode('storage-texture')}>storage texture</button>
		<button data-testid="set-compute-ping-pong" onclick={() => setComputeMode('ping-pong')}>ping-pong</button>
		<button data-testid="set-compute-ping-pong-multi" onclick={() => setComputeMode('ping-pong-multi')}>ping-pong multi</button>
		<button data-testid="set-compute-particle" onclick={() => setComputeMode('particle')}>particle</button>
		<button data-testid="set-compute-bad-shader" onclick={() => setComputeMode('bad-shader')}>bad shader</button>

		<!-- hot-swap: switch compute source at runtime -->
		<button
			data-testid="hot-swap-compute"
			onclick={() => {
				basicComputePass.setCompute(`
@compute @workgroup_size(32, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.99;
	}
}
`);
				computeMode = 'hot-swap';
			}}
		>
			hot swap
		</button>

		<!-- toggle enabled -->
		<button
			data-testid="toggle-compute-enabled"
			onclick={() => {
				basicComputePass.enabled = !basicComputePass.enabled;
				computeMode = 'toggle-enabled';
				// Force reactivity by re-assigning passes array
				activePasses = [...activePasses];
			}}
		>
			toggle enabled
		</button>

		<!-- dispatch override -->
		<button
			data-testid="set-dispatch-override"
			onclick={() => {
				basicComputePass.setDispatch([8, 2, 1]);
				computeMode = 'basic';
				activePasses = [...activePasses];
			}}
		>
			dispatch override
		</button>

		<!-- set-mode and advance controls -->
		<button data-testid="set-mode-always" onclick={() => { controls?.setRenderMode('always'); renderMode = 'always'; }}>always</button>
		<button data-testid="set-mode-manual" onclick={() => { controls?.setRenderMode('manual'); renderMode = 'manual'; }}>manual</button>
		<button data-testid="advance-once" onclick={() => controls?.advance()}>advance</button>
	</section>

	<div class="canvas-shell">
		<FragCanvas material={activeMaterial} passes={activePasses} showErrorOverlay={false} onError={handleError}>
			<RuntimeProbe
				onFrame={(count) => { frameCount = count; }}
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
