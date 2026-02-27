import { onDestroy } from 'svelte';
import type { CurrentReadable } from './current-writable';
import { currentWritable } from './current-writable';
import {
	isAbortError,
	loadTexturesFromUrls,
	type LoadedTexture,
	type TextureLoadOptions
} from './core/texture-loader';

/**
 * Reactive state returned by {@link useTexture}.
 */
export interface UseTextureResult {
	/**
	 * Loaded textures or `null` when unavailable/failed.
	 */
	textures: CurrentReadable<LoadedTexture[] | null>;
	/**
	 * `true` while an active load request is running.
	 */
	loading: CurrentReadable<boolean>;
	/**
	 * Last loading error.
	 */
	error: CurrentReadable<Error | null>;
	/**
	 * Reloads all textures using current URL input.
	 */
	reload: () => Promise<void>;
}

/**
 * Supported URL input variants for `useTexture`.
 */
export type TextureUrlInput = string[] | (() => string[]);

/**
 * Normalizes unknown thrown values to an `Error` instance.
 */
function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error('Unknown texture loading error');
}

/**
 * Releases GPU-side resources for a list of loaded textures.
 */
function disposeTextures(list: LoadedTexture[] | null): void {
	for (const texture of list ?? []) {
		texture.dispose();
	}
}

function mergeAbortSignals(primary: AbortSignal, secondary: AbortSignal | undefined): AbortSignal {
	if (!secondary) {
		return primary;
	}

	if (typeof AbortSignal.any === 'function') {
		return AbortSignal.any([primary, secondary]);
	}

	const fallback = new AbortController();
	const abort = (): void => fallback.abort();
	primary.addEventListener('abort', abort, { once: true });
	secondary.addEventListener('abort', abort, { once: true });
	return fallback.signal;
}

/**
 * Loads textures from URLs and exposes reactive loading/error state.
 *
 * @param urlInput - URLs array or lazy URL provider.
 * @param options - Loader options passed to URL fetch/decode pipeline.
 * @returns Reactive texture loading state with reload support.
 */
export function useTexture(
	urlInput: TextureUrlInput,
	options: TextureLoadOptions = {}
): UseTextureResult {
	const textures = currentWritable<LoadedTexture[] | null>(null);
	const loading = currentWritable(true);
	const error = currentWritable<Error | null>(null);
	let disposed = false;
	let requestVersion = 0;
	let activeController: AbortController | null = null;
	let runningLoad: Promise<void> | null = null;
	let reloadQueued = false;
	const getUrls = typeof urlInput === 'function' ? urlInput : () => urlInput;

	const executeLoad = async (): Promise<void> => {
		if (disposed) {
			return;
		}

		const version = ++requestVersion;
		const controller = new AbortController();
		activeController = controller;
		loading.set(true);
		error.set(null);

		const previous = textures.current;
		try {
			const loaded = await loadTexturesFromUrls(getUrls(), {
				...options,
				signal: mergeAbortSignals(controller.signal, options.signal)
			});
			if (disposed || version !== requestVersion) {
				disposeTextures(loaded);
				return;
			}

			textures.set(loaded);
			disposeTextures(previous);
		} catch (nextError) {
			if (disposed || version !== requestVersion) {
				return;
			}

			if (isAbortError(nextError)) {
				return;
			}

			disposeTextures(previous);
			textures.set(null);
			error.set(toError(nextError));
		} finally {
			if (!disposed && version === requestVersion) {
				loading.set(false);
			}
			if (activeController === controller) {
				activeController = null;
			}
		}
	};

	const runLoadLoop = async (): Promise<void> => {
		do {
			reloadQueued = false;
			await executeLoad();
		} while (reloadQueued && !disposed);
	};

	const load = (): Promise<void> => {
		activeController?.abort();
		if (runningLoad) {
			reloadQueued = true;
			return runningLoad;
		}

		const pending = runLoadLoop();
		runningLoad = pending.finally(() => {
			if (runningLoad === pending) {
				runningLoad = null;
			}
		});
		return runningLoad;
	};

	void load();

	onDestroy(() => {
		disposed = true;
		requestVersion += 1;
		activeController?.abort();
		disposeTextures(textures.current);
	});

	return {
		textures,
		loading,
		error,
		reload: load
	};
}
