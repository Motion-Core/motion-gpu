import { browser } from '$app/environment';

export type Framework = 'svelte' | 'react' | 'vue';

export const frameworks: Framework[] = ['svelte', 'react', 'vue'];

const STORAGE_KEY = 'motiongpuFramework';
const DATASET_KEY = 'motiongpuFramework';

function isFramework(value: string | null): value is Framework {
	return value === 'svelte' || value === 'react' || value === 'vue';
}

function getBootstrapFramework(): Framework | null {
	if (!browser) {
		return null;
	}

	const value = document.documentElement.dataset[DATASET_KEY] ?? null;
	return isFramework(value) ? value : null;
}

function syncBootstrapFramework(value: Framework): void {
	if (!browser) {
		return;
	}

	document.documentElement.dataset[DATASET_KEY] = value;
}

function createFrameworkStore() {
	let active = $state<Framework>('svelte');

	if (browser) {
		let nextActive: Framework = 'svelte';
		const bootstrapped = getBootstrapFramework();
		if (bootstrapped) {
			nextActive = bootstrapped;
		} else {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (isFramework(stored)) {
				nextActive = stored;
			}
		}

		active = nextActive;
		syncBootstrapFramework(nextActive);
	}

	return {
		get active() {
			return active;
		},
		set active(v: Framework) {
			active = v;
			if (browser) {
				localStorage.setItem(STORAGE_KEY, v);
				syncBootstrapFramework(v);
			}
		}
	};
}

export const frameworkStore = createFrameworkStore();
