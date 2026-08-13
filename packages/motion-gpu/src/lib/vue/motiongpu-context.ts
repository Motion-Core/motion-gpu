import { inject, provide, type InjectionKey } from 'vue';
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
 * Vue injection key used to expose `FragCanvas` runtime state.
 */
export const motionGPUContextKey: InjectionKey<MotionGPUContext> = Symbol('motiongpu.context');

/**
 * Registers the motiongpu context in the current Vue component tree.
 *
 * @param context - Context payload to provide.
 */
export function provideMotionGPUContext(context: MotionGPUContext): void {
	provide(motionGPUContextKey, context);
}

/**
 * Returns the active motiongpu context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useMotionGPU(): MotionGPUContext {
	const context = inject(motionGPUContextKey, null);
	if (!context) {
		throw new Error('useMotionGPU must be used inside <FragCanvas>');
	}

	return context;
}
