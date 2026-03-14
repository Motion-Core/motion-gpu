import { getContext, setContext } from 'svelte';
import type { RenderMode } from '../core/types';
import type { CurrentReadable, CurrentWritable } from '../core/current-value';
import type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot
} from '../core/frame-registry';
import type { MotionGPUScheduler as CoreMotionGPUScheduler } from '../core/scheduler-helpers';

/**
 * Svelte context key used to expose `FragCanvas` runtime state.
 */
const MOTIONGPU_CONTEXT_KEY = Symbol('motiongpu.context');

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
 * Public `FragCanvas` runtime context available to hooks and user components.
 */
export interface MotionGPUContext {
	/**
	 * Underlying canvas element used by the renderer.
	 */
	canvas: HTMLCanvasElement | undefined;
	/**
	 * Reactive canvas pixel size.
	 */
	size: CurrentReadable<{ width: number; height: number }>;
	/**
	 * Device pixel ratio multiplier.
	 */
	dpr: CurrentWritable<number>;
	/**
	 * Max frame delta clamp passed to scheduled callbacks.
	 */
	maxDelta: CurrentWritable<number>;
	/**
	 * Scheduler render mode (`always`, `on-demand`, `manual`).
	 */
	renderMode: CurrentWritable<RenderMode>;
	/**
	 * Global toggle for automatic rendering.
	 */
	autoRender: CurrentWritable<boolean>;
	/**
	 * Namespaced user context store shared within the canvas subtree.
	 */
	user: MotionGPUUserContext;
	/**
	 * Marks current frame as invalidated.
	 */
	invalidate: () => void;
	/**
	 * Requests one manual frame advance.
	 */
	advance: () => void;
	/**
	 * Public scheduler API.
	 */
	scheduler: MotionGPUScheduler;
}

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
