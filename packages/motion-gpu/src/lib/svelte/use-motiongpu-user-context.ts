import type { CurrentReadable } from '../core/current-value.js';
import { useMotionGPU, type MotionGPUUserNamespace } from './motiongpu-context.js';

/**
 * Internal shape of the user context store.
 */
type UserContextStore = Record<MotionGPUUserNamespace, unknown>;

/**
 * Object-like context payload used by merge semantics.
 */
type UserContextEntry = Record<string, unknown>;

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
}

/**
 * Checks whether a value is a non-array object suitable for shallow merge.
 */
function isObjectEntry(value: unknown): value is UserContextEntry {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a read-only view of the entire motiongpu user context store.
 */
export function useMotionGPUUserContext<
	UC extends UserContextStore = UserContextStore
>(): CurrentReadable<UC>;

/**
 * Reads a namespaced user context value as a reactive readable store.
 */
export function useMotionGPUUserContext<UCT = unknown>(
	namespace: MotionGPUUserNamespace
): CurrentReadable<UCT | undefined>;

/**
 * Read-only user context hook:
 * - no args: returns full user context store
 * - namespace: returns namespaced store view
 *
 * @param namespace - Optional namespace key.
 */
export function useMotionGPUUserContext<
	UC extends UserContextStore = UserContextStore,
	UCT = unknown
>(namespace?: MotionGPUUserNamespace): CurrentReadable<UC> | CurrentReadable<UCT | undefined> {
	const userStore = useMotionGPU().user;

	if (namespace === undefined) {
		const allStore: CurrentReadable<UC> = {
			get current() {
				return userStore.current as UC;
			},
			subscribe(run) {
				return userStore.subscribe((context) => run(context as UC));
			}
		};

		return allStore;
	}

	const scopedStore: CurrentReadable<UCT | undefined> = {
		get current() {
			return userStore.current[namespace] as UCT | undefined;
		},
		subscribe(run) {
			return userStore.subscribe((context) => run(context[namespace] as UCT | undefined));
		}
	};

	return scopedStore;
}

/**
 * Sets a namespaced user context value with explicit write semantics.
 *
 * Returns the effective value stored under the namespace.
 */
export function setMotionGPUUserContext<UCT = unknown>(
	namespace: MotionGPUUserNamespace,
	value: UCT | (() => UCT),
	options?: SetMotionGPUUserContextOptions
): UCT | undefined {
	const userStore = useMotionGPU().user;
	const mode = options?.existing ?? 'skip';
	let resolvedValue: UCT | undefined;

	userStore.update((context) => {
		const hasExisting = namespace in context;
		if (hasExisting && mode === 'skip') {
			resolvedValue = context[namespace] as UCT | undefined;
			return context;
		}

		const nextValue = typeof value === 'function' ? (value as () => UCT)() : value;
		if (hasExisting && mode === 'merge') {
			const currentValue = context[namespace];
			if (isObjectEntry(currentValue) && isObjectEntry(nextValue)) {
				resolvedValue = {
					...currentValue,
					...nextValue
				} as UCT;
				return {
					...context,
					[namespace]: resolvedValue
				};
			}
		}

		resolvedValue = nextValue;
		return {
			...context,
			[namespace]: nextValue
		};
	});

	return resolvedValue;
}
