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

const PENDING_STAGE_KEY = Symbol('motiongpu-react-pending-stage');

/**
 * React context key for the active frame registry.
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

	const registrationRef = useRef<{
		task: FrameTask;
		start: () => void;
		stop: () => void;
		started: UseFrameResult['started'];
		unsubscribe: () => void;
	} | null>(null);
	const taskRef = useRef<FrameTask>({
		key: resolved.key !== undefined ? resolved.key : Symbol('motiongpu-react-pending-task-key'),
		stage: PENDING_STAGE_KEY
	});
	const startedStoreRef = useRef(createCurrentWritable(false));
	const startedStore = startedStoreRef.current;

	useEffect(() => {
		const wrappedCallback: FrameCallback = (state) => {
			callbackRef.current(state);
		};
		const registration =
			resolved.key === undefined
				? registry.register(wrappedCallback, resolved.options)
				: registry.register(resolved.key, wrappedCallback, resolved.options);
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
	}, [registry, resolved.key, resolved.options, startedStore]);

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
