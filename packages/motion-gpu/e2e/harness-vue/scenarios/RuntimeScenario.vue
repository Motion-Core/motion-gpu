<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, defineMaterial } from '../../../src/lib/vue';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { OutputColorSpace, RenderMode } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import RuntimeProbe from '../RuntimeProbe.vue';
import type { RuntimeControls } from '../runtime-controls';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let pulse = fract(motiongpuFrame.time * 0.5);
	return vec4f(pulse, 0.1, 0.2, 1.0);
}
`
});

const gpuStatus = ref<GpuStatus>('checking');
const frameCount = ref(0);
const renderMode = ref<RenderMode>('always');
const outputColorSpace = ref<OutputColorSpace>('srgb');
const lastError = ref('none');
const controls = ref<RuntimeControls | null>(null);

function setMode(mode: RenderMode): void {
	if (!controls.value) {
		return;
	}

	controls.value.setRenderMode(mode);
	renderMode.value = mode;
}

function handleError(report: MotionGPUErrorReport): void {
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: RuntimeControls): void {
	controls.value = nextControls;
	nextControls.setRenderMode(renderMode.value);
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
			<div data-testid="output-color-space">{{ outputColorSpace }}</div>
			<div data-testid="last-error">{{ lastError }}</div>

			<button class="harness-button" data-testid="set-mode-always" @click="setMode('always')">
				always
			</button>
			<button class="harness-button" data-testid="set-mode-on-demand" @click="setMode('on-demand')">
				on-demand
			</button>
			<button class="harness-button" data-testid="set-mode-manual" @click="setMode('manual')">
				manual
			</button>
			<button class="harness-button" data-testid="invalidate-once" @click="controls?.invalidate()">
				invalidate
			</button>
			<button class="harness-button" data-testid="advance-once" @click="controls?.advance()">
				advance
			</button>
			<button
				class="harness-button"
				data-testid="toggle-output-color-space"
				@click="outputColorSpace = outputColorSpace === 'srgb' ? 'linear' : 'srgb'"
			>
				toggle output
			</button>
		</section>

		<div class="canvas-shell">
			<FragCanvas
				:material="material"
				:outputColorSpace="outputColorSpace"
				:showErrorOverlay="false"
				:onError="handleError"
			>
				<RuntimeProbe :onFrame="(count) => (frameCount = count)" :onReady="handleReady" />
			</FragCanvas>
		</div>
	</main>
</template>
