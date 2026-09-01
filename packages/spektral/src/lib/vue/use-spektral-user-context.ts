import { getCurrentInstance } from 'vue';
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
 * Read-only user context composable:
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

	if (namespace === undefined) {
		return createSpektralUserContextReadable<UC>(userStore);
	}

	return createSpektralUserContextReadable<UC, K>(userStore, namespace);
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
	if (!getCurrentInstance()) {
		throw new Error(
			'setSpektralUserContext must be called during component setup or lifecycle hooks.'
		);
	}

	return setSpektralUserContextValue(useSpektral().user, namespace, value, options);
}
