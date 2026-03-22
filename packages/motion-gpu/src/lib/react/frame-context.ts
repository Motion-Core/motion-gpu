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
 * Resolves stage/task references to a stable frame key.
 */
function toFrameKey(
	reference: FrameKey | FrameTask | FrameStage | undefined
): FrameKey | undefined {
	if (reference === undefined) {
		return undefined;
	}

	return typeof reference === 'string' || typeof reference === 'symbol' ? reference : reference.key;
}

/**
 * Normalizes `before`/`after` dependency inputs to a flat key list.
 */
function normalizeTaskDependencies(
	value: (FrameKey | FrameTask) | (FrameKey | FrameTask)[] | undefined
): FrameKey[] {
	if (value === undefined) {
		return [];
	}

	const list = Array.isArray(value) ? value : [value];
	return list.map((entry) =>
		typeof entry === 'string' || typeof entry === 'symbol' ? entry : entry.key
	);
}

/**
 * Compares two frame key lists with strict positional equality.
 */
function areFrameKeyListsEqual(a: FrameKey[], b: FrameKey[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let index = 0; index < a.length; index += 1) {
		if (!Object.is(a[index], b[index])) {
			return false;
		}
	}

	return true;
}

/**
 * Compares frame invalidation options while accounting for default mode values.
 */
function areInvalidationOptionsEqual(
	a: FrameTaskInvalidation | undefined,
	b: FrameTaskInvalidation | undefined
): boolean {
	if (Object.is(a, b)) {
		return true;
	}

	if (a === undefined || b === undefined) {
		return a === b;
	}

	if (typeof a === 'string' || typeof b === 'string') {
		return a === b;
	}

	const modeA = a.mode ?? 'always';
	const modeB = b.mode ?? 'always';
	if (modeA !== modeB) {
		return false;
	}

	return Object.is(a.token, b.token);
}

/**
 * Compares `useFrame` options structurally to keep effect dependencies stable.
 */
function areUseFrameOptionsEqual(
	a: UseFrameOptions | undefined,
	b: UseFrameOptions | undefined
): boolean {
	if (Object.is(a, b)) {
		return true;
	}

	if (a === undefined || b === undefined) {
		return a === b;
	}

	if (!Object.is(a.autoStart, b.autoStart) || !Object.is(a.autoInvalidate, b.autoInvalidate)) {
		return false;
	}

	if (!Object.is(a.running, b.running)) {
		return false;
	}

	if (!Object.is(toFrameKey(a.stage), toFrameKey(b.stage))) {
		return false;
	}

	if (!areInvalidationOptionsEqual(a.invalidation, b.invalidation)) {
		return false;
	}

	const beforeA = normalizeTaskDependencies(a.before);
	const beforeB = normalizeTaskDependencies(b.before);
	if (!areFrameKeyListsEqual(beforeA, beforeB)) {
		return false;
	}

	const afterA = normalizeTaskDependencies(a.after);
	const afterB = normalizeTaskDependencies(b.after);
	return areFrameKeyListsEqual(afterA, afterB);
}

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
	const stableOptionsRef = useRef(resolved.options);
	if (!areUseFrameOptionsEqual(stableOptionsRef.current, resolved.options)) {
		stableOptionsRef.current = resolved.options;
	}
	const stableOptions = stableOptionsRef.current;

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
				? registry.register(wrappedCallback, stableOptions)
				: registry.register(resolved.key, wrappedCallback, stableOptions);
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
	}, [registry, resolved.key, stableOptions, startedStore]);

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
