import { createContext, useContext } from 'react';
import type { MotionGPUContext } from '../core/motiongpu-context.js';
export type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot,
	MotionGPUContext,
	MotionGPUScheduler,
	MotionGPUUserContext,
	MotionGPUUserNamespace
} from '../core/motiongpu-context.js';

/**
 * Internal React context container.
 */
export const MotionGPUReactContext = createContext<MotionGPUContext | null>(null);

/**
 * Returns active MotionGPU runtime context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useMotionGPU(): MotionGPUContext {
	const context = useContext(MotionGPUReactContext);
	if (!context) {
		throw new Error('useMotionGPU must be used inside <FragCanvas>');
	}

	return context;
}
