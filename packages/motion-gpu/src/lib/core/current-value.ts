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

interface PendingValue<T> {
	value: T;
	version: number;
}

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
	let currentVersion = 0;
	const subscribers = new Set<(value: T) => void>();
	const deliveredVersions = new Map<(value: T) => void, number>();
	const pendingValues: PendingValue<T>[] = [];
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
				const { value, version } = pendingValues[pendingIndex] as PendingValue<T>;
				pendingIndex += 1;

				const snapshot = Array.from(subscribers);
				for (const run of snapshot) {
					if (!subscribers.has(run) || (deliveredVersions.get(run) ?? -1) >= version) {
						continue;
					}
					deliveredVersions.set(run, version);
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
		currentVersion += 1;
		pendingValues.push({ value, version: currentVersion });
		flush();
	};

	return {
		get current() {
			return current;
		},
		subscribe(run) {
			subscribers.add(run);
			deliveredVersions.set(run, currentVersion);
			try {
				run(current);
			} catch (error) {
				subscribers.delete(run);
				deliveredVersions.delete(run);
				throw error;
			}
			return () => {
				subscribers.delete(run);
				deliveredVersions.delete(run);
			};
		},
		set,
		update(updater) {
			set(updater(current));
		}
	};
}
