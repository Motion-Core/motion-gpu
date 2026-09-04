import {
	createCurrentWritable,
	type CurrentReadable,
	type CurrentWritable
} from './current-value.js';
import type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot
} from './frame-registry.js';
import type { SpektralScheduler as CoreSpektralScheduler } from './scheduler-helpers.js';
import type { SpektralGraph } from './render-graph-reader.js';
import type { RenderMode } from './types.js';

export type SpektralScheduler = CoreSpektralScheduler;
export type { FrameProfilingSnapshot, FrameRunTimings, FrameScheduleSnapshot };
export type { SpektralGraph };

/**
 * Namespace identifier for user-owned context entries.
 */
export type SpektralUserNamespace = string | symbol;

type UserContextStore = Readonly<Record<SpektralUserNamespace, unknown>>;

/**
 * Shared user context store exposed by `FragCanvas`.
 */
export type SpektralUserContext = CurrentWritable<UserContextStore>;

/**
 * Public `FragCanvas` runtime context available to framework adapters.
 */
export interface SpektralContext {
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
	user: SpektralUserContext;
	/**
	 * Read-only render graph diagnostics.
	 *
	 * @experimental This API may evolve before Spektral 1.0.
	 */
	readonly graph: SpektralGraph;
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
	scheduler: SpektralScheduler;
}

/**
 * Controls how a namespaced user context value behaves when already present.
 */
export interface SetSpektralUserContextOptions {
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

type UserContextEntry = Record<string | symbol, unknown>;

function createUserContextSnapshot(source?: UserContextStore): UserContextStore {
	const snapshot = Object.create(null) as Record<SpektralUserNamespace, unknown>;
	if (source) {
		Object.assign(snapshot, source);
	}

	return Object.freeze(snapshot);
}

/**
 * Creates a user-context store that publishes frozen, null-prototype namespace snapshots.
 */
export function createSpektralUserContextStore(): SpektralUserContext {
	const store = createCurrentWritable<UserContextStore>(createUserContextSnapshot());

	return {
		get current() {
			return store.current;
		},
		subscribe: store.subscribe,
		set(value) {
			if (Object.is(value, store.current)) {
				return;
			}
			store.set(createUserContextSnapshot(value));
		},
		update(updater) {
			const value = updater(store.current);
			if (Object.is(value, store.current)) {
				return;
			}
			store.set(createUserContextSnapshot(value));
		}
	};
}

/**
 * Creates a read-only view of either the full user store or one namespace.
 */
export function createSpektralUserContextReadable<UC extends UserContextStore>(
	userStore: SpektralUserContext
): CurrentReadable<UC>;
export function createSpektralUserContextReadable<
	UC extends UserContextStore,
	K extends keyof UC & SpektralUserNamespace
>(userStore: SpektralUserContext, namespace: K): CurrentReadable<UC[K] | undefined>;
export function createSpektralUserContextReadable<
	UC extends UserContextStore,
	K extends keyof UC & SpektralUserNamespace
>(
	userStore: SpektralUserContext,
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

function isPlainRecord(value: unknown): value is UserContextEntry {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value) as object | null;
	return prototype === Object.prototype || prototype === null;
}

/**
 * Applies the shared skip, merge and replace semantics to a user context store.
 */
export function setSpektralUserContextValue<UCT = unknown>(
	userStore: SpektralUserContext,
	namespace: SpektralUserNamespace,
	value: UCT | (() => UCT),
	options?: SetSpektralUserContextOptions
): UCT | undefined {
	const mode = options?.existing ?? 'skip';
	const functionValueMode = options?.functionValue ?? 'factory';
	let resolvedValue: UCT | undefined;

	userStore.update((context) => {
		const hasExisting = Object.hasOwn(context, namespace);
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
			if (isPlainRecord(currentValue) && isPlainRecord(nextValue)) {
				resolvedValue = { ...currentValue, ...nextValue } as UCT;
				return { ...context, [namespace]: resolvedValue };
			}
		}

		resolvedValue = nextValue;
		return { ...context, [namespace]: nextValue };
	});

	return resolvedValue;
}
