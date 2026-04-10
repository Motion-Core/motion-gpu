import { onBeforeUnmount, shallowRef } from 'vue';
import type { CurrentReadable } from '../../src/lib/core/current-value.js';

export function useCurrent<T>(store: CurrentReadable<T>) {
	const value = shallowRef(store.current);
	const unsubscribe = store.subscribe((nextValue) => {
		value.value = nextValue;
	});

	onBeforeUnmount(() => {
		unsubscribe();
	});

	return value;
}
