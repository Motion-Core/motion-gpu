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
});
