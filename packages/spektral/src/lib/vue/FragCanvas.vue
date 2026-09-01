<script lang="ts">
import type { SpektralErrorReport } from '../core/error-report.js';
import type { FragMaterial } from '../core/material.js';
import type {
	AnyPass,
	ColorPipelineOptions,
	RenderMode,
	RenderTargetDefinitionMap
} from '../core/types.js';

export interface FragCanvasProps {
	material: FragMaterial;
	renderTargets?: RenderTargetDefinitionMap;
	passes?: AnyPass[];
	clearColor?: [number, number, number, number];
	color?: ColorPipelineOptions;
	renderMode?: RenderMode;
	autoRender?: boolean;
	maxDelta?: number;
	adapterOptions?: GPURequestAdapterOptions;
	deviceDescriptor?: GPUDeviceDescriptor;
	dpr?: number;
	showErrorOverlay?: boolean;
	onError?: (report: SpektralErrorReport) => void;
	errorHistoryLimit?: number;
	onErrorHistory?: (history: readonly SpektralErrorReport[]) => void;
}

const initialDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);
</script>

<script setup lang="ts">
import {
	computed,
	onBeforeUnmount,
	onMounted,
	shallowRef,
	useAttrs,
	useTemplateRef,
	watch,
	type StyleValue
} from 'vue';
import { createCurrentWritable as currentWritable } from '../core/current-value.js';
import { toSpektralErrorReport } from '../core/error-report.js';
import { createFrameRegistry } from '../core/frame-registry.js';
import { createSpektralUserContextStore } from '../core/spektral-context.js';
import { createSpektralRuntimeLoop } from '../core/runtime-loop.js';
import { provideFrameRegistry } from './frame-context.js';
import { provideSpektralContext } from './spektral-context.js';
import SpektralErrorOverlay from './SpektralErrorOverlay.vue';

defineOptions({
	inheritAttrs: false
});

const props = withDefaults(defineProps<FragCanvasProps>(), {
	renderTargets: () => ({}),
	passes: () => [],
	clearColor: () => [0, 0, 0, 1] as [number, number, number, number],
	renderMode: 'always',
	autoRender: true,
	maxDelta: 0.1,
	dpr: () => initialDpr,
	showErrorOverlay: true,
	errorHistoryLimit: 0
});

const wrapperStyle = Object.freeze({
	position: 'relative',
	width: '100%',
	height: '100%',
	minWidth: '0',
	minHeight: '0',
	overflow: 'hidden'
});

const baseCanvasStyle = Object.freeze({
	position: 'absolute',
	inset: '0',
	display: 'block',
	width: '100%',
	height: '100%'
});

const attrs = useAttrs();
const canvasAttrs = computed(() => {
	const { height, style, width, ...rest } = attrs;
	void height;
	void style;
	void width;
	return rest;
});
const resolvedCanvasStyle = computed<StyleValue>(() => [
	baseCanvasStyle,
	attrs.style as StyleValue
]);

defineSlots<{
	default(): unknown;
	errorRenderer(props: { report: SpektralErrorReport }): unknown;
}>();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasEl');
const errorReport = shallowRef<SpektralErrorReport | null>(null);
const dismissErrorOverlay = (): void => {
	errorReport.value = null;
};
const getCanvas = (): HTMLCanvasElement | undefined => canvasRef.value ?? undefined;

defineExpose({
	get canvas() {
		return getCanvas();
	},
	getCanvas
});

const registry = createFrameRegistry({ maxDelta: 0.1 });
provideFrameRegistry(registry);

let requestFrameSignal: (() => void) | null = null;
let runtimeLoopHandle: ReturnType<typeof createSpektralRuntimeLoop> | null = null;
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
const userState = createSpektralUserContextStore();

provideSpektralContext({
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

watch(
	[
		() => props.adapterOptions,
		() => props.clearColor,
		() => props.color,
		() => props.deviceDescriptor,
		() => props.errorHistoryLimit,
		() => props.material,
		() => props.passes,
		() => props.renderTargets
	],
	() => {
		requestFrame();
	}
);

onMounted(() => {
	renderModeState.set(props.renderMode);
	autoRenderState.set(props.autoRender);
	maxDeltaState.set(props.maxDelta);
	dprState.set(props.dpr);
	requestFrame();

	const canvas = canvasRef.value;
	if (!canvas) {
		const report = toSpektralErrorReport(
			new Error('Canvas element is not available'),
			'initialization'
		);
		errorReport.value = report;
		props.onError?.(report);
		return;
	}

	const runtimeLoop = createSpektralRuntimeLoop({
		canvas,
		registry,
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		getMaterial: () => props.material,
		getRenderTargets: () => props.renderTargets,
		getPasses: () => props.passes,
		getClearColor: () => props.clearColor,
		getColor: () => props.color,
		getAdapterOptions: () => props.adapterOptions,
		getDeviceDescriptor: () => props.deviceDescriptor,
		getOnError: () => props.onError,
		getErrorHistoryLimit: () => props.errorHistoryLimit,
		getOnErrorHistory: () => props.onErrorHistory,
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
	<div class="spektral-canvas-wrap" :style="wrapperStyle">
		<canvas v-bind="canvasAttrs" ref="canvasEl" :style="resolvedCanvasStyle"></canvas>
		<template v-if="showErrorOverlay && errorReport">
			<slot name="errorRenderer" :report="errorReport">
				<SpektralErrorOverlay :report="errorReport" :onDismiss="dismissErrorOverlay" />
			</slot>
		</template>
		<slot />
	</div>
</template>

<style>
.spektral-canvas-wrap {
	position: relative;
	width: 100%;
	height: 100%;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
}

.spektral-canvas-wrap > canvas {
	position: absolute;
	inset: 0;
	display: block;
	width: 100%;
	height: 100%;
}
</style>
