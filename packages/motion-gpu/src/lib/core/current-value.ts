/**
 * Minimal subscribe contract used by MotionGPU core.
 */
export interface Subscribable<T> {
	subscribe: (run: (value: T) => void) => () => void;
}

/**
 * Readable value with synchronous access to the latest value.
 */
export interface CurrentReadable<T> extends Subscribable<T> {
	readonly current: T;
}

/**
 * Writable extension of {@link CurrentReadable}.
 */
export interface CurrentWritable<T> extends CurrentReadable<T> {
	set: (value: T) => void;
	update: (updater: (value: T) => T) => void;
}

/**
 * Creates a writable value with immediate subscription semantics.
 */
export function createCurrentWritable<T>(
	initialValue: T,
	onChange?: (value: T) => void
): CurrentWritable<T> {
	let current = initialValue;
	const subscribers = new Set<(value: T) => void>();

	const notify = (value: T): void => {
		for (const run of subscribers) {
			run(value);
		}
	};

	const set = (value: T): void => {
		if (Object.is(current, value)) {
			return;
		}
		current = value;
		notify(value);
		onChange?.(value);
	};

	return {
		get current() {
			return current;
		},
		subscribe(run) {
			subscribers.add(run);
			run(current);
			return () => {
				subscribers.delete(run);
			};
		},
		set,
		update(updater) {
			set(updater(current));
		}
	};
}
