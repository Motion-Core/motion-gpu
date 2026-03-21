import { createCurrentWritable as currentWritable } from '../core/current-value.js';
import { toMotionGPUErrorReport, type MotionGPUErrorReport } from '../core/error-report.js';
import type { FragMaterial } from '../core/material.js';
import { createFrameRegistry } from '../core/frame-registry.js';
import { createMotionGPURuntimeLoop } from '../core/runtime-loop.js';
import type {
	OutputColorSpace,
	RenderPass,
	RenderMode,
	RenderTargetDefinitionMap
} from '../core/types.js';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FrameRegistryReactContext } from './frame-context.js';
import { MotionGPUErrorOverlay } from './MotionGPUErrorOverlay.js';
import { MotionGPUReactContext, type MotionGPUContext } from './motiongpu-context.js';

export interface FragCanvasProps {
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
	errorRenderer?: (report: MotionGPUErrorReport) => ReactNode;
	onError?: (report: MotionGPUErrorReport) => void;
	errorHistoryLimit?: number;
	onErrorHistory?: (history: MotionGPUErrorReport[]) => void;
	className?: string;
	style?: CSSProperties;
	children?: ReactNode;
}

interface RuntimePropsSnapshot {
	material: FragMaterial;
	renderTargets: RenderTargetDefinitionMap;
	passes: RenderPass[];
	clearColor: [number, number, number, number];
	outputColorSpace: OutputColorSpace;
	adapterOptions: GPURequestAdapterOptions | undefined;
	deviceDescriptor: GPUDeviceDescriptor | undefined;
	onError: ((report: MotionGPUErrorReport) => void) | undefined;
	errorHistoryLimit: number;
	onErrorHistory: ((history: MotionGPUErrorReport[]) => void) | undefined;
}

interface FragCanvasRuntimeState {
	registry: ReturnType<typeof createFrameRegistry>;
	context: MotionGPUContext;
	canvasRef: { current: HTMLCanvasElement | undefined };
	size: ReturnType<typeof currentWritable<{ width: number; height: number }>>;
	dprState: ReturnType<typeof currentWritable<number>>;
	maxDeltaState: ReturnType<typeof currentWritable<number>>;
	renderModeState: ReturnType<typeof currentWritable<RenderMode>>;
	autoRenderState: ReturnType<typeof currentWritable<boolean>>;
	requestFrameSignalRef: { current: (() => void) | null };
	requestFrame: () => void;
	invalidateFrame: () => void;
	advanceFrame: () => void;
}

function getInitialDpr(): number {
	if (typeof window === 'undefined') {
		return 1;
	}

	return window.devicePixelRatio ?? 1;
}

function createRuntimeState(initialDpr: number): FragCanvasRuntimeState {
	const registry = createFrameRegistry({ maxDelta: 0.1 });
	const canvasRef = { current: undefined as HTMLCanvasElement | undefined };
	const requestFrameSignalRef = { current: null as (() => void) | null };
	const requestFrame = (): void => {
		requestFrameSignalRef.current?.();
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
	const dprState = currentWritable(initialDpr, requestFrame);
	const maxDeltaState = currentWritable(0.1, (value) => {
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

	const context: MotionGPUContext = {
		get canvas() {
			return canvasRef.current;
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
	};

	return {
		registry,
		context,
		canvasRef,
		size,
		dprState,
		maxDeltaState,
		renderModeState,
		autoRenderState,
		requestFrameSignalRef,
		requestFrame,
		invalidateFrame,
		advanceFrame
	};
}

function getNormalizedErrorHistoryLimit(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return Math.floor(value);
}

export function FragCanvas({
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
	dpr = getInitialDpr(),
	showErrorOverlay = true,
	errorRenderer,
	onError = undefined,
	errorHistoryLimit = 0,
	onErrorHistory = undefined,
	className = '',
	style,
	children
}: FragCanvasProps) {
	const runtimeRef = useRef<FragCanvasRuntimeState | null>(null);
	if (!runtimeRef.current) {
		runtimeRef.current = createRuntimeState(getInitialDpr());
	}
	const runtime = runtimeRef.current;

	const runtimePropsRef = useRef<RuntimePropsSnapshot>({
		material,
		renderTargets,
		passes,
		clearColor,
		outputColorSpace,
		adapterOptions,
		deviceDescriptor,
		onError,
		errorHistoryLimit,
		onErrorHistory
	});
	runtimePropsRef.current = {
		material,
		renderTargets,
		passes,
		clearColor,
		outputColorSpace,
		adapterOptions,
		deviceDescriptor,
		onError,
		errorHistoryLimit,
		onErrorHistory
	};

	const [errorReport, setErrorReport] = useState<MotionGPUErrorReport | null>(null);
	const [errorHistory, setErrorHistory] = useState<MotionGPUErrorReport[]>([]);

	useEffect(() => {
		runtime.renderModeState.set(renderMode);
	}, [renderMode, runtime]);

	useEffect(() => {
		runtime.autoRenderState.set(autoRender);
	}, [autoRender, runtime]);

	useEffect(() => {
		runtime.maxDeltaState.set(maxDelta);
	}, [maxDelta, runtime]);

	useEffect(() => {
		runtime.dprState.set(dpr);
	}, [dpr, runtime]);

	useEffect(() => {
		const limit = getNormalizedErrorHistoryLimit(errorHistoryLimit);
		if (limit <= 0) {
			if (errorHistory.length === 0) {
				return;
			}
			setErrorHistory([]);
			onErrorHistory?.([]);
			return;
		}

		if (errorHistory.length <= limit) {
			return;
		}

		const trimmed = errorHistory.slice(errorHistory.length - limit);
		setErrorHistory(trimmed);
		onErrorHistory?.(trimmed);
	}, [errorHistory, errorHistoryLimit, onErrorHistory]);

	useEffect(() => {
		const canvas = runtime.canvasRef.current;
		if (!canvas) {
			const report = toMotionGPUErrorReport(
				new Error('Canvas element is not available'),
				'initialization'
			);
			setErrorReport(report);
			const historyLimit = getNormalizedErrorHistoryLimit(
				runtimePropsRef.current.errorHistoryLimit
			);
			if (historyLimit > 0) {
				const nextHistory = [report].slice(-historyLimit);
				setErrorHistory(nextHistory);
				runtimePropsRef.current.onErrorHistory?.(nextHistory);
			}
			runtimePropsRef.current.onError?.(report);
			return () => {
				runtime.registry.clear();
			};
		}

		const runtimeLoop = createMotionGPURuntimeLoop({
			canvas,
			registry: runtime.registry,
			size: runtime.size,
			dpr: runtime.dprState,
			maxDelta: runtime.maxDeltaState,
			getMaterial: () => runtimePropsRef.current.material,
			getRenderTargets: () => runtimePropsRef.current.renderTargets,
			getPasses: () => runtimePropsRef.current.passes,
			getClearColor: () => runtimePropsRef.current.clearColor,
			getOutputColorSpace: () => runtimePropsRef.current.outputColorSpace,
			getAdapterOptions: () => runtimePropsRef.current.adapterOptions,
			getDeviceDescriptor: () => runtimePropsRef.current.deviceDescriptor,
			getOnError: () => runtimePropsRef.current.onError,
			getErrorHistoryLimit: () => runtimePropsRef.current.errorHistoryLimit,
			getOnErrorHistory: () => runtimePropsRef.current.onErrorHistory,
			reportErrorHistory: (history) => {
				setErrorHistory(history);
			},
			reportError: (report) => {
				setErrorReport(report);
			}
		});
		runtime.requestFrameSignalRef.current = runtimeLoop.requestFrame;

		return () => {
			runtime.requestFrameSignalRef.current = null;
			runtimeLoop.destroy();
		};
	}, [runtime]);

	const canvasStyle: CSSProperties = {
		position: 'absolute',
		inset: 0,
		display: 'block',
		width: '100%',
		height: '100%',
		...style
	};

	return (
		<FrameRegistryReactContext.Provider value={runtime.registry}>
			<MotionGPUReactContext.Provider value={runtime.context}>
				<div
					className="motiongpu-canvas-wrap"
					style={{
						position: 'relative',
						width: '100%',
						height: '100%',
						minWidth: 0,
						minHeight: 0,
						overflow: 'hidden'
					}}
				>
					<canvas
						className={className}
						style={canvasStyle}
						ref={(node) => {
							runtime.canvasRef.current = node ?? undefined;
						}}
					/>
					{showErrorOverlay && errorReport ? (
						errorRenderer ? (
							errorRenderer(errorReport)
						) : (
							<MotionGPUErrorOverlay report={errorReport} />
						)
					) : null}
					{children}
				</div>
			</MotionGPUReactContext.Provider>
		</FrameRegistryReactContext.Provider>
	);
}
