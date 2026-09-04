<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, PingPongShaderPass, ShaderPass, defineMaterial } from '../../../src/lib/vue';
import type { SpektralErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { AnyPass, RenderTargetDefinitionMap } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import RuntimeProbe from '../RuntimeProbe.vue';
import type { RuntimeControls } from '../runtime-controls';

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

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<RuntimeControls | null>(null);
const frameCount = ref(0);
const material = ref<FragMaterial>(contextMaterial);
const passes = ref<AnyPass[]>([]);
const passMode = ref<'none' | 'invert' | 'named' | 'feedback'>('none');
const renderMode = ref<'always' | 'on-demand' | 'manual'>('manual');
const lastError = ref('none');

function handleError(report: SpektralErrorReport): void {
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
					material = contextMaterial;
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
					material = contextMaterial;
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
					material = contextMaterial;
					passes = [namedWritePass, namedReadPass];
					passMode = 'named';
				"
			>
				named pass
			</button>
			<button
				class="harness-button"
				data-testid="set-pass-feedback"
				@click="
					material = feedbackMaterial;
					passes = [feedbackPass];
					passMode = 'feedback';
				"
			>
				feedback pass
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
