import { describe, expect, it, vi } from 'vitest';
import { createCurrentWritable } from '../lib/core/current-value';

describe('currentWritable', () => {
	it('keeps synchronous current value in sync with set and update', () => {
		const store = createCurrentWritable(1);
		expect(store.current).toBe(1);

		store.set(4);
		expect(store.current).toBe(4);

		store.update((value) => value + 2);
		expect(store.current).toBe(6);
	});

	it('emits changes through subscriptions in order', () => {
		const store = createCurrentWritable('a');
		const values: string[] = [];
		const unsubscribe = store.subscribe((value) => values.push(value));

		store.set('b');
		store.update((value) => `${value}c`);
		unsubscribe();
		store.set('ignored');

		expect(values).toEqual(['a', 'b', 'bc']);
	});

	it('invokes optional onChange callback for writes only', () => {
		const onChange = vi.fn();
		const store = createCurrentWritable({ count: 0 }, onChange);

		expect(onChange).not.toHaveBeenCalled();
		store.set({ count: 1 });
		store.update((value) => ({ count: value.count + 1 }));

		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenNthCalledWith(1, { count: 1 });
		expect(onChange).toHaveBeenNthCalledWith(2, { count: 2 });
	});

	it('does not notify subscribers when set is called with the same primitive value', () => {
		const store = createCurrentWritable(42);
		let callCount = 0;
		store.subscribe(() => {
			callCount++;
		});
		callCount = 0;

		store.set(42);
		expect(callCount).toBe(0);
		expect(store.current).toBe(42);
	});

	it('does not invoke onChange when set is called with the same primitive value', () => {
		const onChange = vi.fn();
		const store = createCurrentWritable(10, onChange);

		store.set(10);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('does not notify subscribers when set is called with the same object reference', () => {
		const obj = { x: 1, y: 2 };
		const store = createCurrentWritable(obj);
		let callCount = 0;
		store.subscribe(() => {
			callCount++;
		});
		callCount = 0;

		store.set(obj);
		expect(callCount).toBe(0);
	});

	it('notifies subscribers when set is called with a different object of same shape', () => {
		const store = createCurrentWritable({ x: 1, y: 2 });
		let callCount = 0;
		store.subscribe(() => {
			callCount++;
		});
		callCount = 0;

		store.set({ x: 1, y: 2 });
		expect(callCount).toBe(1);
	});

	it('deduplicates NaN values correctly', () => {
		const store = createCurrentWritable(NaN);
		let callCount = 0;
		store.subscribe(() => {
			callCount++;
		});
		callCount = 0;

		store.set(NaN);
		expect(callCount).toBe(0);
	});

	it('queues reentrant writes without delivering an older value after a newer value', () => {
		const store = createCurrentWritable(0);
		const firstValues: number[] = [];
		const secondValues: number[] = [];

		store.subscribe((value) => {
			firstValues.push(value);
			if (value === 1) {
				store.set(2);
			}
		});
		store.subscribe((value) => secondValues.push(value));

		store.set(1);

		expect(firstValues).toEqual([0, 1, 2]);
		expect(secondValues).toEqual([0, 1, 2]);
		expect(store.current).toBe(2);
	});

	it('does not notify a subscriber twice when it subscribes during an emission', () => {
		const store = createCurrentWritable(0);
		const lateValues: number[] = [];
		let subscribed = false;

		store.subscribe((value) => {
			if (value === 1 && !subscribed) {
				subscribed = true;
				store.subscribe((lateValue) => lateValues.push(lateValue));
			}
		});

		store.set(1);

		expect(lateValues).toEqual([1]);
	});

	it('skips a subscriber that is removed during an emission', () => {
		const store = createCurrentWritable(0);
		const removedValues: number[] = [];
		let removeSubscriber: () => void = () => undefined;

		store.subscribe((value) => {
			if (value === 1) {
				removeSubscriber();
			}
		});
		removeSubscriber = store.subscribe((value) => removedValues.push(value));

		store.set(1);

		expect(removedValues).toEqual([0]);
	});

	it('finishes queued notifications before rethrowing the first callback error', () => {
		const store = createCurrentWritable(0);
		const delivered: number[] = [];
		store.subscribe((value) => {
			if (value === 1) {
				store.set(2);
				throw new Error('subscriber failed');
			}
		});
		store.subscribe((value) => delivered.push(value));

		expect(() => store.set(1)).toThrow('subscriber failed');
		expect(delivered).toEqual([0, 1, 2]);

		store.set(3);
		expect(delivered).toEqual([0, 1, 2, 3]);
	});

	it('recovers after onChange throws', () => {
		const delivered: number[] = [];
		const store = createCurrentWritable(0, (value) => {
			if (value === 1) {
				throw new Error('onChange failed');
			}
		});
		store.subscribe((value) => delivered.push(value));

		expect(() => store.set(1)).toThrow('onChange failed');
		expect(() => store.set(2)).not.toThrow();
		expect(delivered).toEqual([0, 1, 2]);
	});
});
