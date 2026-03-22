import { useEffect, useState } from 'react';
import type { CurrentReadable } from '../../src/lib/core/current-value';

export function useCurrent<T>(store: CurrentReadable<T>): T {
	const [value, setValue] = useState(store.current);

	useEffect(() => {
		setValue(store.current);
		return store.subscribe((nextValue) => {
			setValue(nextValue);
		});
	}, [store]);

	return value;
}
