import { useCallback, useMemo } from 'react';
import type { CurrentReadable } from '../core/current-value.js';
import {
	useMotionGPU,
	type MotionGPUUserContext,
	type MotionGPUUserNamespace
} from './motiongpu-context.js';

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
	/**
	 * How function inputs should be interpreted:
	 * - `factory`: call function and store its return value
	 * - `value`: store function itself
	 *
	 * @default 'factory'
	 */
	functionValue?: 'factory' | 'value';
}

/**
 * Checks whether a value is a non-array object suitable for shallow merge.
 */
function isObjectEntry(value: unknown): value is UserContextEntry {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sets a namespaced user context value in the provided user store.
 *
 * Returns the effective value stored under the namespace.
 */
function setMotionGPUUserContextInStore<UCT = unknown>(
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

/**
 * Returns a read-only view of the entire motiongpu user context store.
 */
export function useMotionGPUUserContext<
	UC extends UserContextStore = UserContextStore
>(): CurrentReadable<UC>;

/**
 * Reads a namespaced user context value as a reactive readable store.
 */
export function useMotionGPUUserContext<
	UC extends UserContextStore = UserContextStore,
	K extends keyof UC & MotionGPUUserNamespace = keyof UC & MotionGPUUserNamespace
>(namespace: K): CurrentReadable<UC[K] | undefined>;

/**
 * Read-only user context hook:
 * - no args: returns full user context store
 * - namespace: returns namespaced store view
 *
 * @param namespace - Optional namespace key.
 */
export function useMotionGPUUserContext<
	UC extends UserContextStore = UserContextStore,
	K extends keyof UC & MotionGPUUserNamespace = keyof UC & MotionGPUUserNamespace
>(namespace?: K): CurrentReadable<UC> | CurrentReadable<UC[K] | undefined> {
	const userStore = useMotionGPU().user;
	const allStore = useMemo<CurrentReadable<UC>>(
		() => ({
			get current() {
				return userStore.current as UC;
			},
			subscribe(run) {
				return userStore.subscribe((context) => run(context as UC));
			}
		}),
		[userStore]
	);
	const scopedStore = useMemo<CurrentReadable<UC[K] | undefined>>(
		() => ({
			get current() {
				return userStore.current[namespace as MotionGPUUserNamespace] as UC[K] | undefined;
			},
			subscribe(run) {
				return userStore.subscribe((context) =>
					run(context[namespace as MotionGPUUserNamespace] as UC[K] | undefined)
				);
			}
		}),
		[namespace, userStore]
	);

	if (namespace === undefined) {
		return allStore;
	}

	return scopedStore;
}

/**
 * Returns a stable setter bound to the active MotionGPU user context store.
 *
 * @returns Setter function that preserves namespace write semantics.
 */
export function useSetMotionGPUUserContext() {
	const userStore = useMotionGPU().user;
	return useCallback(
		<UCT = unknown>(
			namespace: MotionGPUUserNamespace,
			value: UCT | (() => UCT),
			options?: SetMotionGPUUserContextOptions
		): UCT | undefined => setMotionGPUUserContextInStore(userStore, namespace, value, options),
		[userStore]
	);
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
	return setMotionGPUUserContextInStore(useMotionGPU().user, namespace, value, options);
}
