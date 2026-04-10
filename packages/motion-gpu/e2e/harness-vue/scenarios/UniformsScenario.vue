<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, defineMaterial } from '../../../src/lib/vue';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { RenderMode, UniformValue } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import UniformProbe from './UniformProbe.vue';

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

interface UniformProbeControls {
	setRenderMode: (mode: RenderMode) => void;
	invalidate: () => void;
	advance: () => void;
}

type MaterialMode = 'uniform-a' | 'uniform-b' | 'defines-on' | 'defines-off';

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<UniformProbeControls | null>(null);
const controlsReady = ref(false);
const frameCount = ref(0);
const lastError = ref('none');
const materialMode = ref<MaterialMode>('uniform-a');
const brightnessLevel = ref<'low' | 'high'>('low');
const activeMaterial = ref<FragMaterial>(materialWithUniform);
const uniformName = ref<string | null>('brightness');
const uniformValue = ref<UniformValue>(0.5);

function handleError(report: MotionGPUErrorReport): void {
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: UniformProbeControls): void {
	controls.value = nextControls;
	controlsReady.value = true;
	nextControls.setRenderMode('manual');
}

function applyMaterial(mode: MaterialMode): void {
	materialMode.value = mode;
	if (mode === 'uniform-a') {
		activeMaterial.value = materialWithUniform;
		uniformName.value = 'brightness';
		return;
	}
	if (mode === 'uniform-b') {
		activeMaterial.value = materialAlternate;
		uniformName.value = 'brightness';
		return;
	}
	if (mode === 'defines-on') {
		activeMaterial.value = materialWithDefinesOn;
		uniformName.value = null;
		return;
	}
	activeMaterial.value = materialWithDefinesOff;
	uniformName.value = null;
}

onMounted(async () => {
	gpuStatus.value = await detectGpuStatus();
});
</script>

<template>
	<main class="harness-main">
		<section class="harness-controls">
			<div data-testid="gpu-status">{{ gpuStatus }}</div>
			<div data-testid="controls-ready">{{ controlsReady ? 'yes' : 'no' }}</div>
			<div data-testid="frame-count">{{ frameCount }}</div>
			<div data-testid="last-error">{{ lastError }}</div>
			<div data-testid="material-mode">{{ materialMode }}</div>
			<div data-testid="brightness-level">{{ brightnessLevel }}</div>

			<button
				class="harness-button"
				data-testid="set-material-a"
				@click="applyMaterial('uniform-a')"
			>
				material A
			</button>
			<button
				class="harness-button"
				data-testid="set-material-b"
				@click="applyMaterial('uniform-b')"
			>
				material B
			</button>
			<button
				class="harness-button"
				data-testid="set-material-defines-on"
				@click="applyMaterial('defines-on')"
			>
				defines ON
			</button>
			<button
				class="harness-button"
				data-testid="set-material-defines-off"
				@click="applyMaterial('defines-off')"
			>
				defines OFF
			</button>

			<button
				class="harness-button"
				data-testid="set-brightness-high"
				@click="
					brightnessLevel = 'high';
					uniformValue = 1.0;
				"
			>
				brightness high
			</button>
			<button
				class="harness-button"
				data-testid="set-brightness-low"
				@click="
					brightnessLevel = 'low';
					uniformValue = 0.1;
				"
			>
				brightness low
			</button>

			<button class="harness-button" data-testid="advance-once" @click="controls?.advance()">
				advance
			</button>
		</section>

		<div class="canvas-shell">
			<FragCanvas :material="activeMaterial" :showErrorOverlay="false" :onError="handleError">
				<UniformProbe
					:onFrame="(count) => (frameCount = count)"
					:onReady="handleReady"
					:uniformName="uniformName"
					:uniformValue="uniformValue"
				/>
			</FragCanvas>
		</div>
	</main>
</template>
