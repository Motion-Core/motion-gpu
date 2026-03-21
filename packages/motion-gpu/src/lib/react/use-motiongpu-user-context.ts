import type { CurrentReadable } from '../core/current-value.js';
import { useMotionGPU, type MotionGPUUserNamespace } from './motiongpu-context.js';

/**
 * Internal shape of the user context store.
 */
type UserContextStore = Record<MotionGPUUserNamespace, unknown>;

/**
 * Controls how a namespaced user context value behaves when already present.
 */
export interface SetMotionGPUUserContextOptions {
	existing?: 'merge' | 'replace' | 'skip';
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
 * React implementation placeholder. Full runtime wiring is implemented in a follow-up step.
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
 * Sets a namespaced user context value.
 */
export function setMotionGPUUserContext<UCT = unknown>(
	namespace: MotionGPUUserNamespace,
	value: UCT | (() => UCT),
	options?: SetMotionGPUUserContextOptions
): UCT | undefined {
	void namespace;
	void value;
	void options;
	throw new Error('setMotionGPUUserContext is not implemented yet');
}
