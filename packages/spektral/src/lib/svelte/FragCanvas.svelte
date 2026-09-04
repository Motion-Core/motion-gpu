<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLCanvasAttributes } from 'svelte/elements';
	import type { FragMaterial } from '../core/material';
	import { createCurrentWritable as currentWritable } from '../core/current-value';
	import { toSpektralErrorReport, type SpektralErrorReport } from '../core/error-report';
	import { createSpektralGraphBridge } from '../core/render-graph-reader';
	import { createSpektralUserContextStore } from '../core/spektral-context';
	import SpektralErrorOverlay from './SpektralErrorOverlay.svelte';
	import { createSpektralRuntimeLoop } from '../core/runtime-loop';
	import type {
		AnyPass,
		ColorPipelineOptions,
		FrameInvalidationToken,
		RenderMode,
		RenderTargetDefinitionMap
	} from '../core/types';
	import { provideSpektralContext } from './spektral-context';
	import { createFrameRegistry, provideFrameRegistry } from './frame-context';

	interface FragCanvasOwnProps {
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
		errorRenderer?: Snippet<[SpektralErrorReport]>;
		onError?: (report: SpektralErrorReport) => void;
		errorHistoryLimit?: number;
		onErrorHistory?: (history: readonly SpektralErrorReport[]) => void;
		canvas?: HTMLCanvasElement | undefined;
		children?: Snippet;
	}

	type BlockedCanvasProps = {
		height?: undefined;
		width?: undefined;
	};

	type Props = FragCanvasOwnProps &
		Omit<HTMLCanvasAttributes, keyof FragCanvasOwnProps | keyof BlockedCanvasProps | 'color'> &
		BlockedCanvasProps;

	const initialDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);

	let {
		material,
		renderTargets = {},
		passes = [],
		clearColor = [0, 0, 0, 1],
		color = undefined,
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
		canvas = $bindable(),
		height: blockedHeight = undefined,
		width: blockedWidth = undefined,
		children,
		...canvasProps
	}: Props = $props();

	let errorReport = $state<SpektralErrorReport | null>(null);
	const dismissErrorOverlay = (): void => {
		errorReport = null;
	};

	let forwardedCanvasProps = $derived.by(() => {
		void blockedHeight;
		void blockedWidth;
		return canvasProps;
	});

	const bindCanvas = (node: HTMLCanvasElement) => {
		canvas = node;
		return () => {
			if (canvas === node) {
				canvas = undefined;
			}
		};
	};

	const registry = createFrameRegistry({ maxDelta: 0.1 });
	provideFrameRegistry(registry);
	let requestFrameSignal: (() => void) | null = null;
	const requestFrame = (): void => {
		requestFrameSignal?.();
	};
	const requestFrameForRuntimeInputs = (inputs: readonly unknown[]): void => {
		void inputs;
		requestFrame();
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
	const userState = createSpektralUserContextStore();
	const graphBridge = createSpektralGraphBridge();

	provideSpektralContext({
		get canvas() {
			return canvas;
		},
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		renderMode: renderModeState,
		autoRender: autoRenderState,
		user: userState,
		graph: graphBridge.graph,
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
		autoRenderState.set(autoRender);
		maxDeltaState.set(maxDelta);
		dprState.set(dpr);
		requestFrame();
	});

	$effect(() => {
		requestFrameForRuntimeInputs([
			adapterOptions,
			clearColor,
			color,
			deviceDescriptor,
			errorHistoryLimit,
			material,
			passes,
			renderTargets
		]);
	});

	onMount(() => {
		if (!canvas) {
			const report = toSpektralErrorReport(
				new Error('Canvas element is not available'),
				'initialization'
			);
			errorReport = report;
			onError?.(report);
			return () => {
				graphBridge.updater.reset();
				registry.clear();
			};
		}

		const runtimeLoop = createSpektralRuntimeLoop({
			canvas,
			registry,
			graphUpdater: graphBridge.updater,
			size,
			dpr: dprState,
			maxDelta: maxDeltaState,
			getMaterial: () => material,
			getRenderTargets: () => renderTargets,
			getPasses: () => passes,
			getClearColor: () => clearColor,
			getColor: () => color,
			getAdapterOptions: () => adapterOptions,
			getDeviceDescriptor: () => deviceDescriptor,
			getOnError: () => onError,
			getErrorHistoryLimit: () => errorHistoryLimit,
			getOnErrorHistory: () => onErrorHistory,
			reportError: (report) => {
				errorReport = report;
			}
		});
		requestFrameSignal = runtimeLoop.requestFrame;

		return () => {
			requestFrameSignal = null;
			runtimeLoop.destroy();
			graphBridge.updater.reset();
		};
	});
</script>

<div class="spektral-canvas-wrap">
	<canvas {...forwardedCanvasProps} {@attach bindCanvas} class={className} {style}></canvas>
	{#if showErrorOverlay && errorReport}
		{#if errorRenderer}
			{@render errorRenderer(errorReport)}
		{:else}
			<SpektralErrorOverlay report={errorReport} onDismiss={dismissErrorOverlay} />
		{/if}
	{/if}
	{@render children?.()}
</div>

<style>
	.spektral-canvas-wrap {
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
