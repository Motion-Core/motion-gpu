import { createCurrentWritable as currentWritable } from '../core/current-value.js';
import type { MotionGPUErrorReport } from '../core/error-report.js';
import type { FragMaterial } from '../core/material.js';
import { createFrameRegistry } from '../core/frame-registry.js';
import type {
	OutputColorSpace,
	RenderPass,
	RenderMode,
	RenderTargetDefinitionMap
} from '../core/types.js';
import type { CSSProperties, ReactNode } from 'react';
import { MotionGPUReactContext } from './motiongpu-context.js';

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

/**
 * React implementation placeholder. Full runtime wiring is implemented in a follow-up step.
 */
export function FragCanvas({ className, style, children }: FragCanvasProps) {
	const registry = createFrameRegistry({ maxDelta: 0.1 });
	const size = currentWritable({ width: 0, height: 0 });
	const dprState = currentWritable(1);
	const maxDeltaState = currentWritable(0.1);
	const renderModeState = currentWritable<RenderMode>('always');
	const autoRenderState = currentWritable<boolean>(true);
	const userState = currentWritable<Record<string | symbol, unknown>>({});

	const context = {
		canvas: undefined,
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		renderMode: renderModeState,
		autoRender: autoRenderState,
		user: userState,
		invalidate: () => undefined,
		advance: () => undefined,
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

	return (
		<MotionGPUReactContext.Provider value={context}>
			<div className="motiongpu-canvas-wrap">
				<canvas className={className} style={style} />
				{children}
			</div>
		</MotionGPUReactContext.Provider>
	);
}
