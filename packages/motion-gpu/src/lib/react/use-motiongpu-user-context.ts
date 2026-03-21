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
	existing?: 'merge' | 'replace' | 'skip';
}

function isObjectEntry(value: unknown): value is UserContextEntry {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setMotionGPUUserContextInStore<UCT = unknown>(
	userStore: MotionGPUUserContext,
	namespace: MotionGPUUserNamespace,
	value: UCT | (() => UCT),
	options?: SetMotionGPUUserContextOptions
): UCT | undefined {
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
	const scopedStore = useMemo<CurrentReadable<UCT | undefined>>(
		() => ({
			get current() {
				return userStore.current[namespace as MotionGPUUserNamespace] as UCT | undefined;
			},
			subscribe(run) {
				return userStore.subscribe((context) =>
					run(context[namespace as MotionGPUUserNamespace] as UCT | undefined)
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
 * Sets a namespaced user context value.
 */
export function setMotionGPUUserContext<UCT = unknown>(
	namespace: MotionGPUUserNamespace,
	value: UCT | (() => UCT),
	options?: SetMotionGPUUserContextOptions
): UCT | undefined {
	return setMotionGPUUserContextInStore(useMotionGPU().user, namespace, value, options);
}
