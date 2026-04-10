import { getCurrentInstance, inject, onBeforeUnmount, provide, type InjectionKey } from 'vue';
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
} from '../core/frame-registry.js';

/**
 * Vue injection key used to expose the active frame registry.
 */
export const frameRegistryKey: InjectionKey<FrameRegistry> = Symbol('motiongpu.frame-registry');

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
 * Provides a frame registry through Vue provide/inject.
 *
 * @param registry - Frame registry instance to provide to descendants.
 */
export function provideFrameRegistry(registry: FrameRegistry): void {
	provide(frameRegistryKey, registry);
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
 * Registers a callback in the active frame registry and auto-unsubscribes
 * when the owning component is unmounted.
 *
 * @throws {Error} When called outside `<FragCanvas>`.
 * @throws {Error} When the callback is missing.
 */
export function useFrame(
	keyOrCallback: FrameKey | FrameCallback,
	callbackOrOptions?: FrameCallback | UseFrameOptions,
	maybeOptions?: UseFrameOptions
): UseFrameResult {
	const registry = inject(frameRegistryKey, null);
	if (!registry) {
		throw new Error('useFrame must be used inside <FragCanvas>');
	}

	const registration =
		typeof keyOrCallback === 'function'
			? registry.register(keyOrCallback, callbackOrOptions as UseFrameOptions | undefined)
			: registry.register(keyOrCallback, callbackOrOptions as FrameCallback, maybeOptions);

	if (getCurrentInstance()) {
		onBeforeUnmount(registration.unsubscribe);
	}

	return {
		task: registration.task,
		start: registration.start,
		stop: registration.stop,
		started: registration.started
	};
}
