<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { FragMaterial } from '../core/material';
	import { createCurrentWritable as currentWritable } from '../core/current-value';
	import { toMotionGPUErrorReport, type MotionGPUErrorReport } from '../core/error-report';
	import MotionGPUErrorOverlay from './MotionGPUErrorOverlay.svelte';
	import { createMotionGPURuntimeLoop } from '../core/runtime-loop';
	import type {
		FrameInvalidationToken,
		OutputColorSpace,
		RenderPass,
		RenderMode,
		RenderTargetDefinitionMap
	} from '../core/types';
	import { provideMotionGPUContext } from './motiongpu-context';
	import { createFrameRegistry, provideFrameRegistry } from './frame-context';

	interface Props {
		material: FragMaterial;
		renderTargets?: RenderTargetDefinitionMap;
		passes?: RenderPass[];
		clearColor?: [number, number, number, number];
		outputColorSpace?: OutputColorSpace;
		renderMode?: RenderMode;
		autoRender?: boolean;
		maxDelta?: number;
		adapterOptions?: GPURequestAdapterOptions;
		deviceDescriptor?: GPUDeviceDescriptor;
		dpr?: number;
		showErrorOverlay?: boolean;
		errorRenderer?: Snippet<[MotionGPUErrorReport]>;
		onError?: (report: MotionGPUErrorReport) => void;
		errorHistoryLimit?: number;
		onErrorHistory?: (history: MotionGPUErrorReport[]) => void;
		class?: string;
		style?: string;
		children?: Snippet;
	}

	const initialDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);

	let {
		material,
		renderTargets = {},
		passes = [],
		clearColor = [0, 0, 0, 1],
		outputColorSpace = 'srgb',
		renderMode = 'always',
		autoRender = true,
		maxDelta = 0.1,
		adapterOptions = undefined,
		deviceDescriptor = undefined,
		dpr = initialDpr,
		showErrorOverlay = true,
		errorRenderer = undefined,
		onError = undefined,
		errorHistoryLimit = 0,
		onErrorHistory = undefined,
		class: className = '',
		style = '',
		children
	}: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let errorReport = $state<MotionGPUErrorReport | null>(null);
	let errorHistory = $state<MotionGPUErrorReport[]>([]);

	const getNormalizedErrorHistoryLimit = (): number => {
		if (!Number.isFinite(errorHistoryLimit) || errorHistoryLimit <= 0) {
			return 0;
		}
		return Math.floor(errorHistoryLimit);
	};

	const bindCanvas = (node: HTMLCanvasElement) => {
		canvas = node;
		return {
			destroy: () => {
				if (canvas === node) {
					canvas = undefined;
				}
			}
		};
	};

	const registry = createFrameRegistry({ maxDelta: 0.1 });
	provideFrameRegistry(registry);
	let requestFrameSignal: (() => void) | null = null;
	const requestFrame = (): void => {
		requestFrameSignal?.();
	};
	const invalidateFrame = (token?: FrameInvalidationToken): void => {
		registry.invalidate(token);
		requestFrame();
	};
	const advanceFrame = (): void => {
		registry.advance();
		requestFrame();
	};
	const size = currentWritable({ width: 0, height: 0 });
	const dprState = currentWritable(initialDpr, requestFrame);
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
			return canvas;
		},
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		renderMode: renderModeState,
		autoRender: autoRenderState,
		user: userState,
		invalidate: () => invalidateFrame(),
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

	$effect(() => {
		renderModeState.set(renderMode);
		requestFrame();
	});

	$effect(() => {
		autoRenderState.set(autoRender);
		requestFrame();
	});

	$effect(() => {
		maxDeltaState.set(maxDelta);
		requestFrame();
	});

	$effect(() => {
		dprState.set(dpr);
		requestFrame();
	});

	$effect(() => {
		const limit = getNormalizedErrorHistoryLimit();
		if (limit <= 0) {
			if (errorHistory.length === 0) {
				return;
			}
			errorHistory = [];
			onErrorHistory?.([]);
			return;
		}

		if (errorHistory.length <= limit) {
			return;
		}

		const trimmed = errorHistory.slice(errorHistory.length - limit);
		errorHistory = trimmed;
		onErrorHistory?.(trimmed);
	});

	onMount(() => {
		if (!canvas) {
			const report = toMotionGPUErrorReport(
				new Error('Canvas element is not available'),
				'initialization'
			);
			errorReport = report;
			const historyLimit = getNormalizedErrorHistoryLimit();
			if (historyLimit > 0) {
				const nextHistory = [report].slice(-historyLimit);
				errorHistory = nextHistory;
				onErrorHistory?.(nextHistory);
			}
			onError?.(report);
			return () => registry.clear();
		}

		const runtimeLoop = createMotionGPURuntimeLoop({
			canvas,
			registry,
			size,
			dpr: dprState,
			maxDelta: maxDeltaState,
			getMaterial: () => material,
			getRenderTargets: () => renderTargets,
			getPasses: () => passes,
			getClearColor: () => clearColor,
			getOutputColorSpace: () => outputColorSpace,
			getAdapterOptions: () => adapterOptions,
			getDeviceDescriptor: () => deviceDescriptor,
			getOnError: () => onError,
			getErrorHistoryLimit: () => errorHistoryLimit,
			getOnErrorHistory: () => onErrorHistory,
			reportErrorHistory: (history) => {
				errorHistory = history;
			},
			reportError: (report) => {
				errorReport = report;
			}
		});
		requestFrameSignal = runtimeLoop.requestFrame;

		return () => {
			requestFrameSignal = null;
			runtimeLoop.destroy();
		};
	});
</script>

<div class="motiongpu-canvas-wrap">
	<canvas use:bindCanvas class={className} {style}></canvas>
	{#if showErrorOverlay && errorReport}
		{#if errorRenderer}
			{@render errorRenderer(errorReport)}
		{:else}
			<MotionGPUErrorOverlay report={errorReport} />
		{/if}
	{/if}
	{@render children?.()}
</div>

<style>
	.motiongpu-canvas-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
