import type {
	BundleResult,
	BundleErrorMessage,
	BundleStatusMessage,
	BundleVersionMessage,
	PlaygroundFile
} from './types';
import type { BundleOptions } from './workers/workers';

let uid = 1;

type WorkerMessage = BundleResult | BundleStatusMessage | BundleVersionMessage | BundleErrorMessage;

export default class Bundler {
	#worker: Worker;

	result = $state.raw<BundleResult | null>(null);

	constructor({
		svelte_version,
		onstatus,
		onversion,
		onerror
	}: {
		svelte_version: string;
		onstatus: (val: string | null) => void;
		onversion?: (version: string, supports_async: boolean) => void;
		onerror?: (message: string) => void;
	}) {
		this.#worker = new Worker(new URL('./workers/bundler/index', import.meta.url), {
			type: 'module'
		});

		this.#worker.addEventListener('error', (event) => {
			onerror?.(event.message || 'Bundler worker crashed.');
		});
		this.#worker.addEventListener('messageerror', () => {
			onerror?.('Bundler worker message deserialization failed.');
		});

		this.#worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
			const data = event.data;

			if ('type' in data) {
				if (data.type === 'status') {
					onstatus(data.message);
					return;
				}

				if (data.type === 'version') {
					onversion?.(data.version, data.supports_async);
					return;
				}

				if (data.type === 'error') {
					onerror?.(data.message);
					return;
				}
			}

			onstatus(null);
			this.result = data;
		};

		this.#worker.postMessage({ uid: 0, type: 'init', svelte_version });
	}

	bundle(files: PlaygroundFile[], options: BundleOptions) {
		this.#worker.postMessage({
			uid,
			type: 'bundle',
			files,
			options
		});

		uid += 1;

		return new Promise<void>((resolve) => {
			const destroy = $effect.root(() => {
				let first = true;
				$effect.pre(() => {
					this.result;
					if (first) {
						first = false;
					} else {
						destroy();
						resolve();
					}
				});
			});
		});
	}

	destroy() {
		this.#worker.terminate();
	}
}
