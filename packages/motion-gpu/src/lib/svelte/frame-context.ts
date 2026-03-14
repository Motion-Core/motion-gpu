import { getContext, onDestroy, setContext } from 'svelte';
import {
	createFrameRegistry,
	type FrameCallback,
	type FrameKey,
	type FrameProfilingSnapshot,
	type FrameRegistry,
	type FrameRunTimings,
	type FrameScheduleSnapshot,
	type FrameStage,
	type FrameStageCallback,
	type FrameTask,
	type FrameTaskInvalidation,
	type FrameTaskInvalidationToken,
	type UseFrameOptions,
	type UseFrameResult
} from '../core/frame-registry';

/**
 * Svelte context key for the active frame registry.
 */
const FRAME_CONTEXT_KEY = Symbol('motiongpu.frame-context');

export {
	createFrameRegistry,
	type FrameCallback,
	type FrameKey,
	type FrameProfilingSnapshot,
	type FrameRegistry,
	type FrameRunTimings,
	type FrameScheduleSnapshot,
	type FrameStage,
	type FrameStageCallback,
	type FrameTask,
	type FrameTaskInvalidation,
	type FrameTaskInvalidationToken,
	type UseFrameOptions,
	type UseFrameResult
};

/**
 * Provides a frame registry through Svelte context.
 */
export function provideFrameRegistry(registry: FrameRegistry): void {
	setContext(FRAME_CONTEXT_KEY, registry);
}

/**
 * Registers a frame callback using an auto-generated task key.
 */
export function useFrame(callback: FrameCallback, options?: UseFrameOptions): UseFrameResult;

/**
 * Registers a frame callback with an explicit task key.
 */
export function useFrame(
	key: FrameKey,
	callback: FrameCallback,
	options?: UseFrameOptions
): UseFrameResult;

/**
 * Registers a callback in the active frame registry and auto-unsubscribes on destroy.
 */
export function useFrame(
	keyOrCallback: FrameKey | FrameCallback,
	callbackOrOptions?: FrameCallback | UseFrameOptions,
	maybeOptions?: UseFrameOptions
): UseFrameResult {
	const registry = getContext<FrameRegistry>(FRAME_CONTEXT_KEY);
	if (!registry) {
		throw new Error('useFrame must be used inside <FragCanvas>');
	}

	const registration =
		typeof keyOrCallback === 'function'
			? registry.register(keyOrCallback, callbackOrOptions as UseFrameOptions | undefined)
			: registry.register(keyOrCallback, callbackOrOptions as FrameCallback, maybeOptions);
	onDestroy(registration.unsubscribe);

	return {
		task: registration.task,
		start: registration.start,
		stop: registration.stop,
		started: registration.started
	};
}
