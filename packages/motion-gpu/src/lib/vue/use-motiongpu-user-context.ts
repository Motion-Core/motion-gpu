import { getCurrentInstance } from 'vue';
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
 * Read-only user context composable:
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

	if (namespace === undefined) {
		return createMotionGPUUserContextReadable<UC>(userStore);
	}

	return createMotionGPUUserContextReadable<UC, K>(userStore, namespace);
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
	if (!getCurrentInstance()) {
		throw new Error(
			'setMotionGPUUserContext must be called during component setup or lifecycle hooks.'
		);
	}

	return setMotionGPUUserContextValue(useMotionGPU().user, namespace, value, options);
}
