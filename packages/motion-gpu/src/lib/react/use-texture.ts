import { useCallback, useEffect, useRef } from 'react';
import {
	createCurrentWritable as currentWritable,
	type CurrentReadable
} from '../core/current-value.js';
import {
	isAbortError,
	loadTexturesFromUrls,
	type LoadedTexture,
	type TextureLoadOptions
} from '../core/texture-loader.js';
import { toMotionGPUErrorReport, type MotionGPUErrorReport } from '../core/error-report.js';

/**
 * Reactive state returned by `useTexture`.
 */
export interface UseTextureResult {
	textures: CurrentReadable<LoadedTexture[] | null>;
	loading: CurrentReadable<boolean>;
	error: CurrentReadable<Error | null>;
	errorReport: CurrentReadable<MotionGPUErrorReport | null>;
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

interface MergedAbortSignal {
	signal: AbortSignal;
	dispose: () => void;
}

function mergeAbortSignals(
	primary: AbortSignal,
	secondary: AbortSignal | undefined
): MergedAbortSignal {
	if (!secondary) {
		return {
			signal: primary,
			dispose: () => {}
		};
	}

	if (typeof AbortSignal.any === 'function') {
		return {
			signal: AbortSignal.any([primary, secondary]),
			dispose: () => {}
		};
	}

	const fallback = new AbortController();
	let disposed = false;
	const cleanup = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		primary.removeEventListener('abort', abort);
		secondary.removeEventListener('abort', abort);
	};
	const abort = (): void => fallback.abort();

	primary.addEventListener('abort', abort, { once: true });
	secondary.addEventListener('abort', abort, { once: true });

	return {
		signal: fallback.signal,
		dispose: cleanup
	};
}

/**
 * Loads textures from URLs and exposes reactive loading/error state.
 */
export function useTexture(
	urlInput: TextureUrlInput,
	options: TextureLoadOptions = {}
): UseTextureResult {
	const texturesRef = useRef(currentWritable<LoadedTexture[] | null>(null));
	const loadingRef = useRef(currentWritable(true));
	const errorRef = useRef(currentWritable<Error | null>(null));
	const errorReportRef = useRef(currentWritable<MotionGPUErrorReport | null>(null));
	const activeControllerRef = useRef<AbortController | null>(null);
	const runningLoadRef = useRef<Promise<void> | null>(null);
	const reloadQueuedRef = useRef(false);
	const requestVersionRef = useRef(0);
	const disposedRef = useRef(false);
	const optionsRef = useRef(options);
	const urlInputRef = useRef(urlInput);

	optionsRef.current = options;
	urlInputRef.current = urlInput;

	const getUrls = useCallback((): string[] => {
		const currentInput = urlInputRef.current;
		return typeof currentInput === 'function' ? currentInput() : currentInput;
	}, []);

	const executeLoad = useCallback(async (): Promise<void> => {
		if (disposedRef.current) {
			return;
		}

		const version = ++requestVersionRef.current;
		const controller = new AbortController();
		activeControllerRef.current = controller;
		loadingRef.current.set(true);
		errorRef.current.set(null);
		errorReportRef.current.set(null);

		const previous = texturesRef.current.current;
		const mergedSignal = mergeAbortSignals(controller.signal, optionsRef.current.signal);
		try {
			const loaded = await loadTexturesFromUrls(getUrls(), {
				...optionsRef.current,
				signal: mergedSignal.signal
			});
			if (disposedRef.current || version !== requestVersionRef.current) {
				disposeTextures(loaded);
				return;
			}

			texturesRef.current.set(loaded);
			disposeTextures(previous);
		} catch (nextError) {
			if (disposedRef.current || version !== requestVersionRef.current) {
				return;
			}

			if (isAbortError(nextError)) {
				return;
			}

			disposeTextures(previous);
			texturesRef.current.set(null);
			const normalizedError = toError(nextError);
			errorRef.current.set(normalizedError);
			errorReportRef.current.set(toMotionGPUErrorReport(normalizedError, 'initialization'));
		} finally {
			if (!disposedRef.current && version === requestVersionRef.current) {
				loadingRef.current.set(false);
			}
			if (activeControllerRef.current === controller) {
				activeControllerRef.current = null;
			}
			mergedSignal.dispose();
		}
	}, [getUrls]);

	const runLoadLoop = useCallback(async (): Promise<void> => {
		do {
			reloadQueuedRef.current = false;
			await executeLoad();
		} while (reloadQueuedRef.current && !disposedRef.current);
	}, [executeLoad]);

	const load = useCallback((): Promise<void> => {
		activeControllerRef.current?.abort();
		if (runningLoadRef.current) {
			reloadQueuedRef.current = true;
			return runningLoadRef.current;
		}

		const pending = runLoadLoop();
		const trackedPending = pending.finally(() => {
			if (runningLoadRef.current === trackedPending) {
				runningLoadRef.current = null;
			}
		});
		runningLoadRef.current = trackedPending;
		return trackedPending;
	}, [runLoadLoop]);

	useEffect(() => {
		void load();

		return () => {
			disposedRef.current = true;
			requestVersionRef.current += 1;
			activeControllerRef.current?.abort();
			disposeTextures(texturesRef.current.current);
		};
	}, [load]);

	return {
		textures: texturesRef.current,
		loading: loadingRef.current,
		error: errorRef.current,
		errorReport: errorReportRef.current,
		reload: load
	};
}
