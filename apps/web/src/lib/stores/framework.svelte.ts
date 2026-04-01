import { browser } from '$app/environment';

export type Framework = 'svelte' | 'react';

export const frameworks: Framework[] = ['svelte', 'react'];

const STORAGE_KEY = 'motiongpuFramework';

function isFramework(value: string | null): value is Framework {
	return value === 'svelte' || value === 'react';
}

function createFrameworkStore() {
	let active = $state<Framework>('svelte');

	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (isFramework(stored)) {
			active = stored;
		}
	}

	return {
		get active() {
			return active;
		},
		set active(v: Framework) {
			active = v;
			if (browser) {
				localStorage.setItem(STORAGE_KEY, v);
			}
		}
	};
}

export const frameworkStore = createFrameworkStore();
