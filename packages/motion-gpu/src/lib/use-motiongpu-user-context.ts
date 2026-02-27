import type { CurrentReadable } from './current-writable';
import { useMotionGPU, type MotionGPUUserNamespace } from './motiongpu-context';

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
 * Reads the entire motiongpu user context store.
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
 * Sets a namespaced user context value and returns the resolved value.
 */
export function useMotionGPUUserContext<UCT extends UserContextEntry = UserContextEntry>(
	namespace: MotionGPUUserNamespace,
	value: UCT | (() => UCT),
	options?: SetMotionGPUUserContextOptions
): UCT;

/**
 * Multi-mode user context hook:
 * - no args: returns full user context store
 * - namespace: returns namespaced store view
 * - namespace + value: writes value using selected conflict mode
 *
 * @param namespace - Optional namespace key.
 * @param value - Optional value (or lazy value factory) for write mode.
 * @param options - Optional write behavior flags.
 */
export function useMotionGPUUserContext<
	UCOrEntry extends UserContextStore | UserContextEntry,
	Value extends UserContextEntry | (() => UserContextEntry),
	Result = UCOrEntry extends UserContextStore
		? CurrentReadable<UCOrEntry>
		: Value extends UserContextEntry
			? UserContextEntry
			: CurrentReadable<UserContextEntry | undefined>
>(
	namespace?: MotionGPUUserNamespace,
	value?: Value,
	options?: SetMotionGPUUserContextOptions
): Result {
	const userStore = useMotionGPU().user;

	if (namespace === undefined) {
		return userStore as Result;
	}

	if (value === undefined) {
		const scopedStore: CurrentReadable<UserContextEntry | undefined> = {
			get current() {
				return userStore.current[namespace] as UserContextEntry | undefined;
			},
			subscribe(run) {
				return userStore.subscribe((context) =>
					run(context[namespace] as UserContextEntry | undefined)
				);
			}
		};
		return scopedStore as Result;
	}

	const mode = options?.existing ?? 'skip';
	userStore.update((context) => {
		const hasExisting = namespace in context;
		if (hasExisting && mode === 'skip') {
			return context;
		}

		const nextValue = typeof value === 'function' ? value() : value;
		if (hasExisting && mode === 'merge') {
			const currentValue = context[namespace];
			if (isObjectEntry(currentValue) && isObjectEntry(nextValue)) {
				context[namespace] = {
					...currentValue,
					...nextValue
				};
				return context;
			}
		}

		context[namespace] = nextValue;
		return context;
	});

	return userStore.current[namespace] as Result;
}
