<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, defineMaterial } from '../../../src/lib/vue';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import RuntimeProbe from '../RuntimeProbe.vue';
import type { RuntimeControls } from '../runtime-controls';

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

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<RuntimeControls | null>(null);
const frameCount = ref(0);
const material = ref<FragMaterial>(goodMaterial);
const errorCount = ref(0);
const lastError = ref('none');

function handleError(report: MotionGPUErrorReport): void {
	errorCount.value += 1;
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: RuntimeControls): void {
	controls.value = nextControls;
	nextControls.setRenderMode('always');
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
			<div data-testid="error-count">{{ errorCount }}</div>
			<div data-testid="last-error">{{ lastError }}</div>

			<button class="harness-button" data-testid="set-bad-material" @click="material = badMaterial">
				set bad material
			</button>
			<button
				class="harness-button"
				data-testid="set-good-material"
				@click="material = goodMaterial"
			>
				set good material
			</button>
		</section>

		<div class="canvas-shell">
			<FragCanvas :material="material" :showErrorOverlay="false" :onError="handleError">
				<RuntimeProbe :onFrame="(count) => (frameCount = count)" :onReady="handleReady" />
			</FragCanvas>
		</div>
	</main>
</template>
