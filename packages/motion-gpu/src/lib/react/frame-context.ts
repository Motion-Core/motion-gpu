import { createContext, useContext, useEffect, useRef } from 'react';
import { createCurrentWritable } from '../core/current-value.js';
import { useMotionGPU } from './motiongpu-context.js';
import type {
	FrameCallback,
	FrameKey,
	FrameProfilingSnapshot,
	FrameRegistry,
	FrameRunTimings,
	FrameScheduleSnapshot,
	FrameStage,
	FrameStageCallback,
	FrameTask,
	FrameTaskInvalidation,
	FrameTaskInvalidationToken,
	UseFrameOptions,
	UseFrameResult
} from '../core/frame-registry.js';

/**
 * Placeholder stage used before a frame task registration becomes available.
 */
const PENDING_STAGE_KEY = Symbol('motiongpu-react-pending-stage');

/**
 * React context container for the active frame registry.
 */
export const FrameRegistryReactContext = createContext<FrameRegistry | null>(null);

export type {
	FrameCallback,
	FrameKey,
	FrameProfilingSnapshot,
	FrameRegistry,
	FrameRunTimings,
	FrameScheduleSnapshot,
	FrameStage,
	FrameStageCallback,
	FrameTask,
	FrameTaskInvalidation,
	FrameTaskInvalidationToken,
	UseFrameOptions,
	UseFrameResult
};

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
 * Registers a callback in the active frame registry and auto-unsubscribes on unmount.
 *
 * @param keyOrCallback - Task key or callback for auto-key registration.
 * @param callbackOrOptions - Callback (keyed overload) or options (auto-key overload).
 * @param maybeOptions - Optional registration options for keyed overload.
 * Registration key/options are frozen on first render; subsequent renders do not re-register.
 * @returns Registration control API with task, start/stop controls and started state.
 * @throws {Error} When called outside `<FragCanvas>`.
 * @throws {Error} When callback is missing in keyed overload.
 */
export function useFrame(
	keyOrCallback: FrameKey | FrameCallback,
	callbackOrOptions?: FrameCallback | UseFrameOptions,
	maybeOptions?: UseFrameOptions
): UseFrameResult {
	const registry = useContext(FrameRegistryReactContext);
	if (!registry) {
		throw new Error('useFrame must be used inside <FragCanvas>');
	}
	const motiongpu = useMotionGPU();

	const resolved =
		typeof keyOrCallback === 'function'
			? {
					key: undefined,
					callback: keyOrCallback,
					options: callbackOrOptions as UseFrameOptions | undefined
				}
			: {
					key: keyOrCallback,
					callback: callbackOrOptions as FrameCallback,
					options: maybeOptions
				};
	if (typeof resolved.callback !== 'function') {
		throw new Error('useFrame requires a callback');
	}

	const callbackRef = useRef(resolved.callback);
	callbackRef.current = resolved.callback;
	const registrationConfigRef = useRef<{
		key: FrameKey | undefined;
		options: UseFrameOptions | undefined;
	} | null>(null);
	if (!registrationConfigRef.current) {
		registrationConfigRef.current = {
			key: resolved.key,
			options: resolved.options
		};
	}
	const registrationConfig = registrationConfigRef.current;

	const registrationRef = useRef<{
		task: FrameTask;
		start: () => void;
		stop: () => void;
		started: UseFrameResult['started'];
		unsubscribe: () => void;
	} | null>(null);
	const taskRef = useRef<FrameTask>({
		key:
			registrationConfig.key !== undefined
				? registrationConfig.key
				: Symbol('motiongpu-react-pending-task-key'),
		stage: PENDING_STAGE_KEY
	});
	const startedStoreRef = useRef(createCurrentWritable(false));
	const startedStore = startedStoreRef.current;

	useEffect(() => {
		const wrappedCallback: FrameCallback = (state) => {
			callbackRef.current(state);
		};
		const registration =
			registrationConfig.key === undefined
				? registry.register(wrappedCallback, registrationConfig.options)
				: registry.register(registrationConfig.key, wrappedCallback, registrationConfig.options);
		registrationRef.current = registration;
		taskRef.current = registration.task;
		const unsubscribeStarted = registration.started.subscribe((value) => {
			startedStore.set(value);
		});

		return () => {
			unsubscribeStarted();
			registration.unsubscribe();
			if (registrationRef.current === registration) {
				registrationRef.current = null;
			}
			startedStore.set(false);
			};
	}, [registrationConfig, registry, startedStore]);

	useEffect(() => {
		motiongpu.invalidate();
	}, [motiongpu, resolved.callback]);

	return {
		get task() {
			return taskRef.current;
		},
		start: () => {
			registrationRef.current?.start();
		},
		stop: () => {
			registrationRef.current?.stop();
		},
		started: startedStore
	};
}
