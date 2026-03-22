import { browser } from '$app/environment';
import {
	docsUiConfig,
	availablePackageManagers,
	type PackageManagerOption
} from '$lib/config/docs-ui';

export type PackageManager = PackageManagerOption;

const enabledManagers = Array.from(
	new Set(
		docsUiConfig.packageManager.enabled.filter((pm): pm is PackageManager =>
			availablePackageManagers.includes(pm)
		)
	)
);

export const packageManagers: PackageManager[] =
	enabledManagers.length > 0 ? enabledManagers : ['npm'];

const DATASET_KEY = 'motiongpuPackageManager';

function isPackageManager(value: string | null): value is PackageManager {
	return !!value && packageManagers.includes(value as PackageManager);
}

function getBootstrapPackageManager(): PackageManager | null {
	if (!browser) {
		return null;
	}

	const value = document.documentElement.dataset[DATASET_KEY] ?? null;
	return isPackageManager(value) ? value : null;
}

function syncBootstrapPackageManager(value: PackageManager): void {
	if (!browser) {
		return;
	}

	document.documentElement.dataset[DATASET_KEY] = value;
}

function createPackageManagerStore() {
	const configuredDefault = docsUiConfig.packageManager.default;
	let active = $state<PackageManager>(
		packageManagers.includes(configuredDefault) ? configuredDefault : packageManagers[0]
	);

	if (browser) {
		const bootstrapped = getBootstrapPackageManager();
		if (bootstrapped) {
			active = bootstrapped;
		} else {
			const stored = localStorage.getItem(
				docsUiConfig.packageManager.storageKey
			) as PackageManager | null;
			if (stored && packageManagers.includes(stored)) {
				active = stored;
			}
		}
		syncBootstrapPackageManager(active);
	}

	return {
		get active() {
			return active;
		},
		set active(v: PackageManager) {
			active = v;
			if (browser) {
				localStorage.setItem(docsUiConfig.packageManager.storageKey, v);
				syncBootstrapPackageManager(v);
			}
		}
	};
}

export const packageManagerStore = createPackageManagerStore();
