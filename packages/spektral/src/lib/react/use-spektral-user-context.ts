import { useCallback, useMemo } from 'react';
import type { CurrentReadable } from '../core/current-value.js';
import {
	createSpektralUserContextReadable,
	setSpektralUserContextValue,
	type SetSpektralUserContextOptions
} from '../core/spektral-context.js';
import { useSpektral, type SpektralUserNamespace } from './spektral-context.js';

export type { SetSpektralUserContextOptions } from '../core/spektral-context.js';

/**
 * Internal shape of the user context store.
 */
type UserContextStore = Record<SpektralUserNamespace, unknown>;

/**
 * Returns a read-only view of the entire spektral user context store.
 */
export function useSpektralUserContext<
	UC extends UserContextStore = UserContextStore
>(): CurrentReadable<UC>;

/**
 * Reads a namespaced user context value as a reactive readable store.
 */
export function useSpektralUserContext<
	UC extends UserContextStore = UserContextStore,
	K extends keyof UC & SpektralUserNamespace = keyof UC & SpektralUserNamespace
>(namespace: K): CurrentReadable<UC[K] | undefined>;

/**
 * Read-only user context hook:
 * - no args: returns full user context store
 * - namespace: returns namespaced store view
 *
 * @param namespace - Optional namespace key.
 */
export function useSpektralUserContext<
	UC extends UserContextStore = UserContextStore,
	K extends keyof UC & SpektralUserNamespace = keyof UC & SpektralUserNamespace
>(namespace?: K): CurrentReadable<UC> | CurrentReadable<UC[K] | undefined> {
	const userStore = useSpektral().user;
	const allStore = useMemo<CurrentReadable<UC>>(
		() => createSpektralUserContextReadable<UC>(userStore),
		[userStore]
	);
	const scopedStore = useMemo<CurrentReadable<UC[K] | undefined>>(
		() => createSpektralUserContextReadable<UC, K>(userStore, namespace as K),
		[namespace, userStore]
	);

	if (namespace === undefined) {
		return allStore;
	}

	return scopedStore;
}

/**
 * Returns a stable setter bound to the active Spektral user context store.
 *
 * @returns Setter function that preserves namespace write semantics.
 */
export function useSetSpektralUserContext() {
	const userStore = useSpektral().user;
	return useCallback(
		<UCT = unknown>(
			namespace: SpektralUserNamespace,
			value: UCT | (() => UCT),
			options?: SetSpektralUserContextOptions
		): UCT | undefined => setSpektralUserContextValue(userStore, namespace, value, options),
		[userStore]
	);
}

/**
 * Sets a namespaced user context value with explicit write semantics.
 *
 * Returns the effective value stored under the namespace.
 */
export function setSpektralUserContext<UCT = unknown>(
	namespace: SpektralUserNamespace,
	value: UCT | (() => UCT),
	options?: SetSpektralUserContextOptions
): UCT | undefined {
	// eslint-disable-next-line react-hooks/rules-of-hooks -- Lifecycle-bound cross-adapter API; useSetSpektralUserContext is the conventional callback-safe React form.
	return setSpektralUserContextValue(useSpektral().user, namespace, value, options);
}
