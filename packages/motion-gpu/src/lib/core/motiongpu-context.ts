import type { CurrentReadable, CurrentWritable } from './current-value.js';
import type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot
} from './frame-registry.js';
import type { MotionGPUScheduler as CoreMotionGPUScheduler } from './scheduler-helpers.js';
import type { RenderMode } from './types.js';

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
 * Public `FragCanvas` runtime context available to framework adapters.
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
 * Controls how a namespaced user context value behaves when already present.
 */
export interface SetMotionGPUUserContextOptions {
	/**
	 * Conflict strategy when namespace already exists:
	 * - `skip`: keep current value
	 * - `replace`: replace current value
	 * - `merge`: shallow merge object values, fallback to replace otherwise
	 *
	 * @default 'skip'
	 */
	existing?: 'merge' | 'replace' | 'skip';
	/**
	 * How function inputs should be interpreted:
	 * - `factory`: call function and store its return value
	 * - `value`: store function itself
	 *
	 * @default 'factory'
	 */
	functionValue?: 'factory' | 'value';
}

type UserContextStore = Record<MotionGPUUserNamespace, unknown>;
type UserContextEntry = Record<string, unknown>;

/**
 * Creates a read-only view of either the full user store or one namespace.
 */
export function createMotionGPUUserContextReadable<UC extends UserContextStore>(
	userStore: MotionGPUUserContext
): CurrentReadable<UC>;
export function createMotionGPUUserContextReadable<
	UC extends UserContextStore,
	K extends keyof UC & MotionGPUUserNamespace
>(userStore: MotionGPUUserContext, namespace: K): CurrentReadable<UC[K] | undefined>;
export function createMotionGPUUserContextReadable<
	UC extends UserContextStore,
	K extends keyof UC & MotionGPUUserNamespace
>(
	userStore: MotionGPUUserContext,
	namespace?: K
): CurrentReadable<UC> | CurrentReadable<UC[K] | undefined> {
	if (namespace === undefined) {
		return {
			get current() {
				return userStore.current as UC;
			},
			subscribe(run: (value: UC) => void) {
				return userStore.subscribe((context) => run(context as UC));
			}
		};
	}

	return {
		get current() {
			return userStore.current[namespace] as UC[K] | undefined;
		},
		subscribe(run: (value: UC[K] | undefined) => void) {
			return userStore.subscribe((context) => run(context[namespace] as UC[K] | undefined));
		}
	};
}

function isObjectEntry(value: unknown): value is UserContextEntry {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies the shared skip, merge and replace semantics to a user context store.
 */
export function setMotionGPUUserContextValue<UCT = unknown>(
	userStore: MotionGPUUserContext,
	namespace: MotionGPUUserNamespace,
	value: UCT | (() => UCT),
	options?: SetMotionGPUUserContextOptions
): UCT | undefined {
	const mode = options?.existing ?? 'skip';
	const functionValueMode = options?.functionValue ?? 'factory';
	let resolvedValue: UCT | undefined;

	userStore.update((context) => {
		const hasExisting = namespace in context;
		if (hasExisting && mode === 'skip') {
			resolvedValue = context[namespace] as UCT | undefined;
			return context;
		}

		const nextValue =
			typeof value === 'function' && functionValueMode === 'factory'
				? (value as () => UCT)()
				: (value as UCT);
		if (hasExisting && mode === 'merge') {
			const currentValue = context[namespace];
			if (isObjectEntry(currentValue) && isObjectEntry(nextValue)) {
				resolvedValue = { ...currentValue, ...nextValue } as UCT;
				return { ...context, [namespace]: resolvedValue };
			}
		}

		resolvedValue = nextValue;
		return { ...context, [namespace]: nextValue };
	});

	return resolvedValue;
}
