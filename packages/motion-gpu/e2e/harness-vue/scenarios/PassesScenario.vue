<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, ShaderPass, defineMaterial } from '../../../src/lib/vue';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { RenderPass, RenderTargetDefinitionMap } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import RuntimeProbe from '../RuntimeProbe.vue';
import type { RuntimeControls } from '../runtime-controls';

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

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<RuntimeControls | null>(null);
const frameCount = ref(0);
const passes = ref<RenderPass[]>([]);
const passMode = ref<'none' | 'invert' | 'named'>('none');
const renderMode = ref<'always' | 'on-demand' | 'manual'>('manual');
const lastError = ref('none');

function handleError(report: MotionGPUErrorReport): void {
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: RuntimeControls): void {
	controls.value = nextControls;
	nextControls.setRenderMode('manual');
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
			<div data-testid="pass-mode">{{ passMode }}</div>

			<button
				class="harness-button"
				data-testid="set-pass-none"
				@click="
					passes = [];
					passMode = 'none';
				"
			>
				no pass
			</button>
			<button
				class="harness-button"
				data-testid="set-pass-invert"
				@click="
					passes = [invertPass];
					passMode = 'invert';
				"
			>
				invert pass
			</button>
			<button
				class="harness-button"
				data-testid="set-pass-named"
				@click="
					passes = [namedWritePass, namedReadPass];
					passMode = 'named';
				"
			>
				named pass
			</button>
			<button class="harness-button" data-testid="advance-once" @click="controls?.advance()">
				advance
			</button>
		</section>

		<div class="canvas-shell">
			<FragCanvas
				:material="material"
				:passes="passes"
				:renderTargets="renderTargets"
				:showErrorOverlay="false"
				:onError="handleError"
			>
				<RuntimeProbe :onFrame="(count) => (frameCount = count)" :onReady="handleReady" />
			</FragCanvas>
		</div>
	</main>
</template>
