import { createContext, useContext } from 'react';
import type { RenderMode } from '../core/types.js';
import type { CurrentReadable, CurrentWritable } from '../core/current-value.js';
import type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot
} from '../core/frame-registry.js';
import type { MotionGPUScheduler as CoreMotionGPUScheduler } from '../core/scheduler-helpers.js';

/**
 * React context payload exposed by `<FragCanvas>`.
 */
export interface MotionGPUContext {
	canvas: HTMLCanvasElement | undefined;
	size: CurrentReadable<{ width: number; height: number }>;
	dpr: CurrentWritable<number>;
	maxDelta: CurrentWritable<number>;
	renderMode: CurrentWritable<RenderMode>;
	autoRender: CurrentWritable<boolean>;
	user: MotionGPUUserContext;
	invalidate: () => void;
	advance: () => void;
	scheduler: MotionGPUScheduler;
}

export type MotionGPUScheduler = CoreMotionGPUScheduler;
export type { FrameProfilingSnapshot, FrameRunTimings, FrameScheduleSnapshot };

/**
 * Namespace identifier for user-owned context entries.
 */
export type MotionGPUUserNamespace = string | symbol;

/**
 * Shared user context store exposed by `FragCanvas`.
 */
export type MotionGPUUserContext = CurrentWritable<Record<MotionGPUUserNamespace, unknown>>;

/**
 * Internal React context container.
 */
export const MotionGPUReactContext = createContext<MotionGPUContext | null>(null);

/**
 * Returns active MotionGPU runtime context.
 */
export function useMotionGPU(): MotionGPUContext {
	const context = useContext(MotionGPUReactContext);
	if (!context) {
		throw new Error('useMotionGPU must be used inside <FragCanvas>');
	}

	return context;
}
