import { useCallback, useMemo } from 'react';
import type { CurrentReadable } from '../core/current-value.js';
import {
	createMotionGPUUserContextReadable,
	setMotionGPUUserContextValue,
	type SetMotionGPUUserContextOptions
} from '../core/motiongpu-context.js';
import { useMotionGPU, type MotionGPUUserNamespace } from './motiongpu-context.js';

export type { SetMotionGPUUserContextOptions } from '../core/motiongpu-context.js';

/**
 * Internal shape of the user context store.
 */
type UserContextStore = Record<MotionGPUUserNamespace, unknown>;

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
		() => createMotionGPUUserContextReadable<UC>(userStore),
		[userStore]
	);
	const scopedStore = useMemo<CurrentReadable<UC[K] | undefined>>(
		() => createMotionGPUUserContextReadable<UC, K>(userStore, namespace as K),
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
		): UCT | undefined => setMotionGPUUserContextValue(userStore, namespace, value, options),
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
	// eslint-disable-next-line react-hooks/rules-of-hooks -- Lifecycle-bound cross-adapter API; useSetMotionGPUUserContext is the conventional callback-safe React form.
	return setMotionGPUUserContextValue(useMotionGPU().user, namespace, value, options);
}
