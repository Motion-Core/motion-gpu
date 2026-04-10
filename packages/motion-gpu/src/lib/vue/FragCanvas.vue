<script lang="ts">
import type { MotionGPUErrorReport } from '../core/error-report.js';
import type { FragMaterial } from '../core/material.js';
import type {
	AnyPass,
	OutputColorSpace,
	RenderMode,
	RenderTargetDefinitionMap
} from '../core/types.js';

export interface FragCanvasProps {
	material: FragMaterial;
	renderTargets?: RenderTargetDefinitionMap;
	passes?: AnyPass[];
	clearColor?: [number, number, number, number];
	outputColorSpace?: OutputColorSpace;
	renderMode?: RenderMode;
	autoRender?: boolean;
	maxDelta?: number;
	adapterOptions?: GPURequestAdapterOptions;
	deviceDescriptor?: GPUDeviceDescriptor;
	dpr?: number;
	showErrorOverlay?: boolean;
	onError?: (report: MotionGPUErrorReport) => void;
	errorHistoryLimit?: number;
	onErrorHistory?: (history: MotionGPUErrorReport[]) => void;
	canvasClass?: string;
	canvasStyle?: string | Record<string, string | number>;
}

const initialDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { createCurrentWritable as currentWritable } from '../core/current-value.js';
import { toMotionGPUErrorReport } from '../core/error-report.js';
import { createFrameRegistry } from '../core/frame-registry.js';
import { createMotionGPURuntimeLoop } from '../core/runtime-loop.js';
import { provideFrameRegistry } from './frame-context.js';
import { provideMotionGPUContext } from './motiongpu-context.js';
import MotionGPUErrorOverlay from './MotionGPUErrorOverlay.vue';

const props = withDefaults(defineProps<FragCanvasProps>(), {
	renderTargets: () => ({}),
	passes: () => [],
	clearColor: () => [0, 0, 0, 1] as [number, number, number, number],
	outputColorSpace: 'srgb',
	renderMode: 'always',
	autoRender: true,
	maxDelta: 0.1,
	dpr: () => initialDpr,
	showErrorOverlay: true,
	errorHistoryLimit: 0,
	canvasClass: ''
});

defineSlots<{
	default(): unknown;
	errorRenderer(props: { report: MotionGPUErrorReport }): unknown;
}>();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasEl');
const errorReport = shallowRef<MotionGPUErrorReport | null>(null);
const errorHistory = shallowRef<MotionGPUErrorReport[]>([]);

const registry = createFrameRegistry({ maxDelta: 0.1 });
provideFrameRegistry(registry);

let requestFrameSignal: (() => void) | null = null;
let runtimeLoopHandle: ReturnType<typeof createMotionGPURuntimeLoop> | null = null;
const requestFrame = (): void => {
	requestFrameSignal?.();
};
const invalidateFrame = (): void => {
	registry.invalidate();
	requestFrame();
};
const advanceFrame = (): void => {
	registry.advance();
	requestFrame();
};

const size = currentWritable({ width: 0, height: 0 });
const dprState = currentWritable<number>(initialDpr, requestFrame);
const maxDeltaState = currentWritable<number>(0.1, (value) => {
	registry.setMaxDelta(value);
	requestFrame();
});
const renderModeState = currentWritable<RenderMode>('always', (value) => {
	registry.setRenderMode(value);
	requestFrame();
});
const autoRenderState = currentWritable<boolean>(true, (value) => {
	registry.setAutoRender(value);
	requestFrame();
});
const userState = currentWritable<Record<string | symbol, unknown>>({});

provideMotionGPUContext({
	get canvas() {
		return canvasRef.value ?? undefined;
	},
	size,
	dpr: dprState,
	maxDelta: maxDeltaState,
	renderMode: renderModeState,
	autoRender: autoRenderState,
	user: userState,
	invalidate: invalidateFrame,
	advance: advanceFrame,
	scheduler: {
		createStage: registry.createStage,
		getStage: registry.getStage,
		setDiagnosticsEnabled: registry.setDiagnosticsEnabled,
		getDiagnosticsEnabled: registry.getDiagnosticsEnabled,
		getLastRunTimings: registry.getLastRunTimings,
		getSchedule: registry.getSchedule,
		setProfilingEnabled: registry.setProfilingEnabled,
		setProfilingWindow: registry.setProfilingWindow,
		resetProfiling: registry.resetProfiling,
		getProfilingEnabled: registry.getProfilingEnabled,
		getProfilingWindow: registry.getProfilingWindow,
		getProfilingSnapshot: registry.getProfilingSnapshot
	}
});

/**
 * Normalizes the user-supplied error history limit to a non-negative integer.
 */
function getNormalizedErrorHistoryLimit(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return Math.floor(value);
}

watch(
	() => props.renderMode,
	(value) => {
		renderModeState.set(value);
	}
);

watch(
	() => props.autoRender,
	(value) => {
		autoRenderState.set(value);
	}
);

watch(
	() => props.maxDelta,
	(value) => {
		maxDeltaState.set(value);
	}
);

watch(
	() => props.dpr,
	(value) => {
		dprState.set(value);
	}
);

watch([() => errorHistory.value, () => props.errorHistoryLimit], ([history, rawLimit]) => {
	const limit = getNormalizedErrorHistoryLimit(rawLimit);
	if (limit <= 0) {
		if (history.length === 0) {
			return;
		}
		errorHistory.value = [];
		props.onErrorHistory?.([]);
		return;
	}

	if (history.length <= limit) {
		return;
	}

	const trimmed = history.slice(history.length - limit);
	errorHistory.value = trimmed;
	props.onErrorHistory?.(trimmed);
});

onMounted(() => {
	renderModeState.set(props.renderMode);
	autoRenderState.set(props.autoRender);
	maxDeltaState.set(props.maxDelta);
	dprState.set(props.dpr);
	requestFrame();

	const canvas = canvasRef.value;
	if (!canvas) {
		const report = toMotionGPUErrorReport(
			new Error('Canvas element is not available'),
			'initialization'
		);
		errorReport.value = report;
		const historyLimit = getNormalizedErrorHistoryLimit(props.errorHistoryLimit);
		if (historyLimit > 0) {
			const nextHistory = [report].slice(-historyLimit);
			errorHistory.value = nextHistory;
			props.onErrorHistory?.(nextHistory);
		}
		props.onError?.(report);
		return;
	}

	const runtimeLoop = createMotionGPURuntimeLoop({
		canvas,
		registry,
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		getMaterial: () => props.material,
		getRenderTargets: () => props.renderTargets,
		getPasses: () => props.passes,
		getClearColor: () => props.clearColor,
		getOutputColorSpace: () => props.outputColorSpace,
		getAdapterOptions: () => props.adapterOptions,
		getDeviceDescriptor: () => props.deviceDescriptor,
		getOnError: () => props.onError,
		getErrorHistoryLimit: () => props.errorHistoryLimit,
		getOnErrorHistory: () => props.onErrorHistory,
		reportErrorHistory: (history) => {
			errorHistory.value = history;
		},
		reportError: (report) => {
			errorReport.value = report;
		}
	});
	runtimeLoopHandle = runtimeLoop;
	requestFrameSignal = runtimeLoop.requestFrame;
});

onBeforeUnmount(() => {
	requestFrameSignal = null;
	runtimeLoopHandle?.destroy();
	runtimeLoopHandle = null;
	registry.clear();
});
</script>

<template>
	<div class="motiongpu-canvas-wrap">
		<canvas ref="canvasEl" :class="canvasClass" :style="canvasStyle"></canvas>
		<template v-if="showErrorOverlay && errorReport">
			<slot name="errorRenderer" :report="errorReport">
				<MotionGPUErrorOverlay :report="errorReport" />
			</slot>
		</template>
		<slot />
	</div>
</template>

<style>
.motiongpu-canvas-wrap {
	position: relative;
	width: 100%;
	height: 100%;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
}

.motiongpu-canvas-wrap > canvas {
	position: absolute;
	inset: 0;
	display: block;
	width: 100%;
	height: 100%;
}
</style>
