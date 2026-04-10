<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, ComputePass, ShaderPass, defineMaterial } from '../../../src/lib/vue';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { AnyPass } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import RuntimeProbe from '../RuntimeProbe.vue';
import type { RuntimeControls } from '../runtime-controls';

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

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<RuntimeControls | null>(null);
const frameCount = ref(0);
const lastError = ref('none');
const errorCount = ref(0);
const passConfig = ref<PassConfig>('none');
const activePasses = ref<AnyPass[]>([]);
const passCount = ref(0);
let errorCounter = 0;
let badShaderVariant = 0;

function handleError(report: MotionGPUErrorReport): void {
	errorCounter += 1;
	errorCount.value = errorCounter;
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: RuntimeControls): void {
	controls.value = nextControls;
	nextControls.setRenderMode('manual');
}

function applyConfig(config: PassConfig): void {
	passConfig.value = config;
	let nextPasses: AnyPass[] = [];

	if (config === 'single-shader') {
		redShiftPass.enabled = true;
		nextPasses = [redShiftPass];
	} else if (config === 'chain-3') {
		redShiftPass.enabled = true;
		greenShiftPass.enabled = true;
		blueShiftPass.enabled = true;
		nextPasses = [redShiftPass, greenShiftPass, blueShiftPass];
	} else if (config === 'compute-only') {
		computePass.enabled = true;
		nextPasses = [computePass];
	} else if (config === 'compute-plus-shader') {
		computePass.enabled = true;
		redShiftPass.enabled = true;
		nextPasses = [computePass, redShiftPass];
	} else if (config === 'toggle-middle') {
		redShiftPass.enabled = true;
		greenShiftPass.enabled = false;
		blueShiftPass.enabled = true;
		nextPasses = [redShiftPass, greenShiftPass, blueShiftPass];
	} else if (config === 'bad-shader-pass' || config === 'multi-error') {
		badShaderVariant += 1;
		badShaderPass.setFragment(`
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(UNDEFINED_VALUE_${badShaderVariant}.rgb, 1.0);
}
`);
		badShaderPass.enabled = true;
		nextPasses = [badShaderPass];
	}

	activePasses.value = nextPasses;
	passCount.value = nextPasses.length;
}

function toggleMiddlePass(): void {
	greenShiftPass.enabled = !greenShiftPass.enabled;
	activePasses.value = [...activePasses.value];
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
			<div data-testid="last-error">{{ lastError }}</div>
			<div data-testid="error-count">{{ errorCount }}</div>
			<div data-testid="pass-config">{{ passConfig }}</div>
			<div data-testid="pass-count">{{ passCount }}</div>

			<button class="harness-button" data-testid="set-config-none" @click="applyConfig('none')">
				none
			</button>
			<button
				class="harness-button"
				data-testid="set-config-single-shader"
				@click="applyConfig('single-shader')"
			>
				single shader
			</button>
			<button class="harness-button" data-testid="set-config-chain-3" @click="applyConfig('chain-3')">
				chain 3
			</button>
			<button
				class="harness-button"
				data-testid="set-config-compute-only"
				@click="applyConfig('compute-only')"
			>
				compute only
			</button>
			<button
				class="harness-button"
				data-testid="set-config-compute-plus-shader"
				@click="applyConfig('compute-plus-shader')"
			>
				compute+shader
			</button>
			<button
				class="harness-button"
				data-testid="set-config-toggle-middle"
				@click="applyConfig('toggle-middle')"
			>
				toggle middle
			</button>
			<button
				class="harness-button"
				data-testid="set-config-bad-shader-pass"
				@click="applyConfig('bad-shader-pass')"
			>
				bad shader pass
			</button>
			<button
				class="harness-button"
				data-testid="set-config-multi-error"
				@click="applyConfig('multi-error')"
			>
				multi error
			</button>

			<button class="harness-button" data-testid="toggle-middle-pass" @click="toggleMiddlePass">
				toggle green pass
			</button>
			<button class="harness-button" data-testid="advance-once" @click="controls?.advance()">
				advance
			</button>
			<button
				class="harness-button"
				data-testid="set-mode-always"
				@click="controls?.setRenderMode('always')"
			>
				always
			</button>
			<button
				class="harness-button"
				data-testid="set-mode-manual"
				@click="controls?.setRenderMode('manual')"
			>
				manual
			</button>
		</section>

		<div class="canvas-shell">
			<FragCanvas
				:material="materialWithStorage"
				:passes="activePasses"
				:showErrorOverlay="false"
				:onError="handleError"
			>
				<RuntimeProbe :onFrame="(count) => (frameCount = count)" :onReady="handleReady" />
			</FragCanvas>
		</div>
	</main>
</template>
