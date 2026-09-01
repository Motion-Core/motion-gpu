import { onBeforeUnmount, shallowRef, type ShallowRef } from 'vue';
import type { CurrentReadable } from '../../src/lib/core/current-value.js';

export function useCurrent<T>(store: CurrentReadable<T>): ShallowRef<T> {
	const value = shallowRef<T>(store.current);
	const unsubscribe = store.subscribe((nextValue) => {
		value.value = nextValue;
	});

	onBeforeUnmount(() => {
		unsubscribe();
	});

	return value;
}
