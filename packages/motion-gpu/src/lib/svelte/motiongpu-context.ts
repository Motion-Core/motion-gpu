import { getContext, setContext } from 'svelte';
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
 * Svelte context key used to expose `FragCanvas` runtime state.
 */
const MOTIONGPU_CONTEXT_KEY = Symbol('motiongpu.context');

/**
 * Registers the motiongpu context in the current Svelte component tree.
 *
 * @param context - Context payload to provide.
 */
export function provideMotionGPUContext(context: MotionGPUContext): void {
	setContext(MOTIONGPU_CONTEXT_KEY, context);
}

/**
 * Returns the active motiongpu context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useMotionGPU(): MotionGPUContext {
	const context = getContext<MotionGPUContext>(MOTIONGPU_CONTEXT_KEY);
	if (!context) {
		throw new Error('useMotionGPU must be used inside <FragCanvas>');
	}

	return context;
}
