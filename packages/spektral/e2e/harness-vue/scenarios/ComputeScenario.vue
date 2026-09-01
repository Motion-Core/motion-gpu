<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, ComputePass, PingPongComputePass, defineMaterial } from '../../../src/lib/vue';
import type { SpektralErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { AnyPass } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import RuntimeProbe from '../RuntimeProbe.vue';
import type { RuntimeControls } from '../runtime-controls';

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

const materialWithStorageTexture = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
	textures: {
		computeOutput: {
			storage: true,
			format: 'rgba8unorm' as GPUTextureFormat,
			width: 64,
			height: 64
		}
	}
});

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
			format: 'rgba8unorm' as GPUTextureFormat,
			width: 64,
			height: 64
		}
	}
});

const materialMinimal = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let t = spektralFrame.time;
	return vec4f(uv * sin(t * 0.5) * 0.5 + 0.5, 0.5, 1.0);
}
`,
	storageBuffers: {
		particles: { type: 'array<vec4f>', size: 1024, access: 'read-write' }
	}
});

const createSamplerMaterial = (filter: GPUFilterMode) =>
	defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	let pos = vec2i(uv * vec2f(textureDimensions(sampleOutput)));
	return textureLoad(sampleOutput, pos, 0);
}
`,
		textures: {
			sampleInput: {
				storage: true,
				format: 'rgba8unorm' as GPUTextureFormat,
				width: 2,
				height: 2,
				filter
			},
			sampleOutput: {
				storage: true,
				format: 'rgba8unorm' as GPUTextureFormat,
				width: 64,
				height: 64
			}
		}
	});

const materialWithNearestSampler = createSamplerMaterial('nearest');
const materialWithLinearSampler = createSamplerMaterial('linear');

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
	resources: { data: { buffer: 'data', access: 'storage-read-write' } },
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
	resources: { data: { buffer: 'data', access: 'storage-read-write' } },
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
	resources: { data: { buffer: 'data', access: 'storage-read-write' } },
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
	resources: { data: { buffer: 'data', access: 'storage-read-write' } },
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
	resources: { computeOutput: { texture: 'computeOutput', access: 'storage-write' } },
	dispatch: [8, 8, 1]
});

const seedSampleTexturePass = new ComputePass({
	compute: `
@compute @workgroup_size(2, 2, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	if (id.x < 2u && id.y < 2u) {
		let color = vec4f(f32(id.x), f32(id.y), f32(id.x ^ id.y), 1.0);
		textureStore(uSeed, id.xy, color);
	}
}
`,
	resources: { uSeed: { texture: 'sampleInput', access: 'storage-write' } },
	dispatch: [1, 1, 1]
});

const sampledTextureComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = id.xy;
	let dims = textureDimensions(uOutput);
	if (pos.x < dims.x && pos.y < dims.y) {
		let uv = (vec2f(pos) + vec2f(0.5)) / vec2f(dims);
		let color = textureSampleLevel(uInput, uSampler, uv, 0.0);
		textureStore(uOutput, pos, color);
	}
}
`,
	resources: {
		uInput: { texture: 'sampleInput', access: 'sampled' },
		uOutput: { texture: 'sampleOutput', access: 'storage-write' },
		uSampler: { sampler: 'sampleInput' }
	},
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
	resources: {
		simulationA: { texture: 'simulation', access: 'sampled', pingPong: 'read' },
		simulationB: { texture: 'simulation', access: 'storage-write', pingPong: 'write' }
	},
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
	resources: {
		simulationA: { texture: 'simulation', access: 'sampled', pingPong: 'read' },
		simulationB: { texture: 'simulation', access: 'storage-write', pingPong: 'write' }
	},
	iterations: 4,
	dispatch: [8, 8, 1]
});

const particleComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&particles)) {
		let t = spektralFrame.time;
		particles[idx] = vec4f(sin(t + f32(idx)), cos(t + f32(idx)), 0.0, 1.0);
	}
}
`,
	resources: { particles: { buffer: 'particles', access: 'storage-read-write' } },
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
	resources: { data: { buffer: 'data', access: 'storage-read-write' } },
	dispatch: [1]
});

type ComputeMode =
	| 'none'
	| 'basic'
	| 'auto-dispatch'
	| 'dynamic-dispatch'
	| 'disabled'
	| 'storage-texture'
	| 'sample-nearest'
	| 'sample-linear'
	| 'ping-pong'
	| 'ping-pong-multi'
	| 'particle'
	| 'bad-shader'
	| 'hot-swap'
	| 'toggle-enabled';

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<RuntimeControls | null>(null);
const frameCount = ref(0);
const lastError = ref('none');
const errorCount = ref(0);
const computeMode = ref<ComputeMode>('none');
const renderMode = ref<'always' | 'on-demand' | 'manual'>('manual');
const activePasses = ref<AnyPass[]>([]);
const activeMaterial = ref<FragMaterial>(materialWithStorageBuffer);
let errorCounter = 0;

function handleError(report: SpektralErrorReport): void {
	errorCounter += 1;
	errorCount.value = errorCounter;
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: RuntimeControls): void {
	controls.value = nextControls;
	nextControls.setRenderMode('manual');
	renderMode.value = 'manual';
}

function applyMode(mode: ComputeMode): void {
	computeMode.value = mode;

	if (mode === 'none') {
		activePasses.value = [];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}
	if (mode === 'basic') {
		activePasses.value = [basicComputePass];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}
	if (mode === 'auto-dispatch') {
		activePasses.value = [autoDispatchComputePass];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}
	if (mode === 'dynamic-dispatch') {
		activePasses.value = [dynamicDispatchComputePass];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}
	if (mode === 'disabled') {
		activePasses.value = [disabledComputePass];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}
	if (mode === 'storage-texture') {
		activePasses.value = [storageTextureComputePass];
		activeMaterial.value = materialWithStorageTexture;
		return;
	}
	if (mode === 'sample-nearest') {
		// Deliberately list the reader first; the current-version dependency schedules the seed pass first.
		activePasses.value = [sampledTextureComputePass, seedSampleTexturePass];
		activeMaterial.value = materialWithNearestSampler;
		return;
	}
	if (mode === 'sample-linear') {
		// Deliberately list the reader first; the current-version dependency schedules the seed pass first.
		activePasses.value = [sampledTextureComputePass, seedSampleTexturePass];
		activeMaterial.value = materialWithLinearSampler;
		return;
	}
	if (mode === 'ping-pong') {
		activePasses.value = [pingPongComputePass];
		activeMaterial.value = materialWithPingPong;
		return;
	}
	if (mode === 'ping-pong-multi') {
		activePasses.value = [pingPongMultiIterComputePass];
		activeMaterial.value = materialWithPingPong;
		return;
	}
	if (mode === 'particle') {
		activePasses.value = [particleComputePass];
		activeMaterial.value = materialMinimal;
		return;
	}
	if (mode === 'bad-shader') {
		activePasses.value = [badComputePass];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}
	if (mode === 'hot-swap') {
		activePasses.value = [basicComputePass];
		activeMaterial.value = materialWithStorageBuffer;
		return;
	}

	basicComputePass.enabled = true;
	activePasses.value = [basicComputePass];
	activeMaterial.value = materialWithStorageBuffer;
}

function hotSwapCompute(): void {
	basicComputePass.setCompute(`
@compute @workgroup_size(32, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.99;
	}
}
`);
	computeMode.value = 'hot-swap';
}

function toggleComputeEnabled(): void {
	basicComputePass.enabled = !basicComputePass.enabled;
	computeMode.value = 'toggle-enabled';
	activePasses.value = [...activePasses.value];
}

function setDispatchOverride(): void {
	basicComputePass.setDispatch([8, 2, 1]);
	computeMode.value = 'basic';
	activePasses.value = [...activePasses.value];
}

function setModeAlways(): void {
	controls.value?.setRenderMode('always');
	renderMode.value = 'always';
}

function setModeManual(): void {
	controls.value?.setRenderMode('manual');
	renderMode.value = 'manual';
}

onMounted(async () => {
	gpuStatus.value = await detectGpuStatus();
});
</script>

<template>
	<main class="harness-main">
		<section class="harness-controls">
			<div data-testid="gpu-status">{{ gpuStatus }}</div>
			<div data-testid="controls-ready">{{ controls ? 'yes' : 'no' }}</div>
			<div data-testid="frame-count">{{ frameCount }}</div>
			<div data-testid="render-mode">{{ renderMode }}</div>
			<div data-testid="last-error">{{ lastError }}</div>
			<div data-testid="error-count">{{ errorCount }}</div>
			<div data-testid="compute-mode">{{ computeMode }}</div>
			<div data-testid="pass-count">{{ activePasses.length }}</div>

			<button class="harness-button" data-testid="set-compute-none" @click="applyMode('none')">
				none
			</button>
			<button class="harness-button" data-testid="set-compute-basic" @click="applyMode('basic')">
				basic
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-auto-dispatch"
				@click="applyMode('auto-dispatch')"
			>
				auto dispatch
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-dynamic-dispatch"
				@click="applyMode('dynamic-dispatch')"
			>
				dynamic dispatch
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-disabled"
				@click="applyMode('disabled')"
			>
				disabled
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-storage-texture"
				@click="applyMode('storage-texture')"
			>
				storage texture
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-sample-nearest"
				@click="applyMode('sample-nearest')"
			>
				sample nearest
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-sample-linear"
				@click="applyMode('sample-linear')"
			>
				sample linear
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-ping-pong"
				@click="applyMode('ping-pong')"
			>
				ping-pong
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-ping-pong-multi"
				@click="applyMode('ping-pong-multi')"
			>
				ping-pong multi
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-particle"
				@click="applyMode('particle')"
			>
				particle
			</button>
			<button
				class="harness-button"
				data-testid="set-compute-bad-shader"
				@click="applyMode('bad-shader')"
			>
				bad shader
			</button>

			<button class="harness-button" data-testid="hot-swap-compute" @click="hotSwapCompute">
				hot swap
			</button>

			<button
				class="harness-button"
				data-testid="toggle-compute-enabled"
				@click="toggleComputeEnabled"
			>
				toggle enabled
			</button>

			<button
				class="harness-button"
				data-testid="set-dispatch-override"
				@click="setDispatchOverride"
			>
				dispatch override
			</button>

			<button class="harness-button" data-testid="set-mode-always" @click="setModeAlways">
				always
			</button>
			<button class="harness-button" data-testid="set-mode-manual" @click="setModeManual">
				manual
			</button>
			<button class="harness-button" data-testid="advance-once" @click="controls?.advance()">
				advance
			</button>
		</section>

		<div class="canvas-shell">
			<FragCanvas
				:material="activeMaterial"
				:passes="activePasses"
				:showErrorOverlay="false"
				:onError="handleError"
			>
				<RuntimeProbe :onFrame="(count) => (frameCount = count)" :onReady="handleReady" />
			</FragCanvas>
		</div>
	</main>
</template>
