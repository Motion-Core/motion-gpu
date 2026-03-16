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
});
