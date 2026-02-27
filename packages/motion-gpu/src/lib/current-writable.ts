import { writable, type Readable } from 'svelte/store';

/**
 * Readable store with synchronous access to the latest value.
 */
export interface CurrentReadable<T> extends Readable<T> {
	/**
	 * Latest store value.
	 */
	readonly current: T;
}

/**
 * Writable extension of {@link CurrentReadable}.
 */
export interface CurrentWritable<T> extends CurrentReadable<T> {
	/**
	 * Sets next value.
	 */
	set: (value: T) => void;
	/**
	 * Updates value based on previous value.
	 */
	update: (updater: (value: T) => T) => void;
}

/**
 * Creates a writable store that exposes the current value without subscription.
 *
 * @param initialValue - Initial store value.
 * @param onChange - Optional side-effect callback invoked on every `set`.
 * @returns Current-aware writable store.
 */
export function currentWritable<T>(
	initialValue: T,
	onChange?: (value: T) => void
): CurrentWritable<T> {
	let current = initialValue;
	const store = writable(initialValue);

	const set = (value: T) => {
		current = value;
		store.set(value);
		onChange?.(value);
	};

	return {
		get current() {
			return current;
		},
		subscribe: store.subscribe,
		set,
		update(updater) {
			set(updater(current));
		}
	};
}
