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

const NO_PENDING_ERROR = Symbol('motiongpu-current-no-error');

/**
 * Creates a writable value with immediate subscription semantics.
 * Accepted writes are delivered FIFO to a subscriber snapshot. `onChange` runs
 * after that snapshot for each value, preserving the original callback order.
 */
export function createCurrentWritable<T>(
	initialValue: T,
	onChange?: (value: T) => void
): CurrentWritable<T> {
	let current = initialValue;
	const subscribers = new Set<(value: T) => void>();
	const pendingValues: T[] = [];
	let pendingIndex = 0;
	let isFlushing = false;

	const flush = (): void => {
		if (isFlushing) {
			return;
		}

		isFlushing = true;
		let firstError: unknown = NO_PENDING_ERROR;
		try {
			while (pendingIndex < pendingValues.length) {
				const value = pendingValues[pendingIndex] as T;
				pendingIndex += 1;

				const snapshot = Array.from(subscribers);
				for (const run of snapshot) {
					if (!subscribers.has(run)) {
						continue;
					}
					try {
						run(value);
					} catch (error) {
						if (firstError === NO_PENDING_ERROR) {
							firstError = error;
						}
					}
				}

				try {
					onChange?.(value);
				} catch (error) {
					if (firstError === NO_PENDING_ERROR) {
						firstError = error;
					}
				}
			}
		} finally {
			pendingValues.length = 0;
			pendingIndex = 0;
			isFlushing = false;
		}

		if (firstError !== NO_PENDING_ERROR) {
			throw firstError;
		}
	};

	const set = (value: T): void => {
		if (Object.is(current, value)) {
			return;
		}
		current = value;
		pendingValues.push(value);
		flush();
	};

	return {
		get current() {
			return current;
		},
		subscribe(run) {
			subscribers.add(run);
			try {
				run(current);
			} catch (error) {
				subscribers.delete(run);
				throw error;
			}
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
