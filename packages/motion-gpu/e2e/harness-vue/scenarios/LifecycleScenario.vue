<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FragCanvas, defineMaterial, useTexture } from '../../../src/lib/vue';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { RenderMode } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { useCurrent } from '../use-current';
import LifecycleProbe from './LifecycleProbe.vue';

const simpleMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let center = vec2f(0.5, 0.5);
	if (distance(uv, center) > 0.35) {
		discard;
	}
	return vec4f(uv, 0.5, 1.0);
}
`
});

const texturedMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return textureSample(artwork, artworkSampler, uv);
}
`,
	textures: {
		artwork: {}
	}
});

function createTestTextureUrl(): string {
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = 4;
	const context = canvas.getContext('2d');
	if (!context) {
		return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
	}

	context.fillStyle = '#ff6600';
	context.fillRect(0, 0, 4, 4);
	context.fillStyle = '#0066ff';
	context.fillRect(0, 0, 2, 2);
	context.fillStyle = '#00ff66';
	context.fillRect(2, 2, 2, 2);
	return canvas.toDataURL('image/png');
}

const TEST_TEXTURE_URL = createTestTextureUrl();

interface LifecycleProbeControls {
	setRenderMode: (mode: RenderMode) => void;
	invalidate: () => void;
	advance: () => void;
	startFrameCallback: () => void;
	stopFrameCallback: () => void;
}

type ClearColorMode = 'red' | 'blue' | 'default';
type SceneMode = 'simple' | 'textured';

const gpuStatus = ref<GpuStatus>('checking');
const controls = ref<LifecycleProbeControls | null>(null);
const controlsReady = ref(false);
const frameCount = ref(0);
const lastError = ref('none');
const clearColorMode = ref<ClearColorMode>('default');
const sceneMode = ref<SceneMode>('simple');
const frameCallbackRunning = ref(true);
const activeMaterial = ref<FragMaterial>(simpleMaterial);
const clearColor = ref<[number, number, number, number]>([0, 0, 0, 1]);

const textureUrls = ref<string[]>([TEST_TEXTURE_URL]);
const textureResult = useTexture(() => textureUrls.value);
const textureLoading = useCurrent(textureResult.loading);
const textures = useCurrent(textureResult.textures);

function handleError(report: MotionGPUErrorReport): void {
	lastError.value = `${report.title}: ${report.rawMessage}`;
}

function handleReady(nextControls: LifecycleProbeControls): void {
	controls.value = nextControls;
	controlsReady.value = true;
	nextControls.setRenderMode('manual');
}

function applyClearColor(mode: ClearColorMode): void {
	clearColorMode.value = mode;
	if (mode === 'red') {
		clearColor.value = [1, 0, 0, 1];
		return;
	}
	if (mode === 'blue') {
		clearColor.value = [0, 0, 1, 1];
		return;
	}
	clearColor.value = [0, 0, 0, 1];
}

function applySceneMode(mode: SceneMode): void {
	sceneMode.value = mode;
	activeMaterial.value = mode === 'textured' ? texturedMaterial : simpleMaterial;
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
			<div data-testid="clear-color-mode">{{ clearColorMode }}</div>
			<div data-testid="scene-mode">{{ sceneMode }}</div>
			<div data-testid="frame-callback-running">{{ frameCallbackRunning ? 'yes' : 'no' }}</div>
			<div data-testid="texture-loading">{{ textureLoading ? 'yes' : 'no' }}</div>
			<div data-testid="texture-count">{{ textures?.length ?? 0 }}</div>

			<button class="harness-button" data-testid="set-clear-red" @click="applyClearColor('red')">
				clear red
			</button>
			<button class="harness-button" data-testid="set-clear-blue" @click="applyClearColor('blue')">
				clear blue
			</button>
			<button
				class="harness-button"
				data-testid="set-clear-default"
				@click="applyClearColor('default')"
			>
				clear default
			</button>

			<button
				class="harness-button"
				data-testid="set-scene-simple"
				@click="applySceneMode('simple')"
			>
				simple
			</button>
			<button
				class="harness-button"
				data-testid="set-scene-textured"
				@click="applySceneMode('textured')"
			>
				textured
			</button>

			<button
				class="harness-button"
				data-testid="start-frame-callback"
				@click="
					frameCallbackRunning = true;
					controls?.startFrameCallback();
				"
			>
				start callback
			</button>
			<button
				class="harness-button"
				data-testid="stop-frame-callback"
				@click="
					frameCallbackRunning = false;
					controls?.stopFrameCallback();
				"
			>
				stop callback
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
				:material="activeMaterial"
				:clearColor="clearColor"
				:showErrorOverlay="false"
				:onError="handleError"
			>
				<LifecycleProbe :onFrame="(count) => (frameCount = count)" :onReady="handleReady" />
			</FragCanvas>
		</div>
	</main>
</template>
