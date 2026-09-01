import { createCurrentWritable as currentWritable, type CurrentReadable } from './current-value.js';
import { toSpektralErrorReport, type SpektralErrorReport } from './error-report.js';
import {
	isAbortError,
	loadTexturesFromUrls,
	mergeAbortSignals,
	type LoadedTexture,
	type TextureLoadOptions
} from './texture-loader.js';

interface TextureLoadController {
	textures: CurrentReadable<LoadedTexture[] | null>;
	loading: CurrentReadable<boolean>;
	error: CurrentReadable<Error | null>;
	errorReport: CurrentReadable<SpektralErrorReport | null>;
	reload: () => Promise<void>;
	resume: () => void;
	dispose: () => void;
}

function disposeTextures(textures: LoadedTexture[] | null): void {
	for (const texture of textures ?? []) {
		texture.dispose();
	}
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error('Unknown texture loading error');
}

export function createTextureLoadController({
	getUrls,
	getOptions
}: {
	getUrls: () => string[];
	getOptions: () => TextureLoadOptions;
}): TextureLoadController {
	const textures = currentWritable<LoadedTexture[] | null>(null);
	const loading = currentWritable(true);
	const error = currentWritable<Error | null>(null);
	const errorReport = currentWritable<SpektralErrorReport | null>(null);
	let disposed = false;
	let requestVersion = 0;
	let activeController: AbortController | null = null;
	let runningLoad: Promise<void> | null = null;
	let reloadQueued = false;

	const executeLoad = async (): Promise<void> => {
		if (disposed) return;

		const version = ++requestVersion;
		const controller = new AbortController();
		activeController = controller;
		loading.set(true);
		error.set(null);
		errorReport.set(null);

		const previous = textures.current;
		let mergedSignal: ReturnType<typeof mergeAbortSignals> | null = null;
		try {
			const urls = getUrls();
			const options = getOptions() ?? {};
			mergedSignal = mergeAbortSignals(controller.signal, options.signal);
			const loaded = await loadTexturesFromUrls(urls, {
				...options,
				signal: mergedSignal.signal
			});
			if (disposed || version !== requestVersion) {
				disposeTextures(loaded);
				return;
			}

			textures.set(loaded);
			disposeTextures(previous);
		} catch (nextError) {
			if (disposed || version !== requestVersion || isAbortError(nextError)) return;

			disposeTextures(previous);
			textures.set(null);
			const normalizedError = toError(nextError);
			error.set(normalizedError);
			errorReport.set(toSpektralErrorReport(normalizedError, 'initialization'));
		} finally {
			if (!disposed && version === requestVersion) loading.set(false);
			if (activeController === controller) activeController = null;
			mergedSignal?.dispose();
		}
	};

	const runLoadLoop = async (): Promise<void> => {
		do {
			reloadQueued = false;
			await executeLoad();
		} while (reloadQueued && !disposed);
	};

	const reload = (): Promise<void> => {
		activeController?.abort();
		if (runningLoad) {
			reloadQueued = true;
			return runningLoad;
		}

		const pending = runLoadLoop();
		const trackedPending = pending.finally(() => {
			if (runningLoad === trackedPending) runningLoad = null;
		});
		runningLoad = trackedPending;
		return trackedPending;
	};

	const resume = (): void => {
		disposed = false;
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		requestVersion += 1;
		activeController?.abort();
		disposeTextures(textures.current);
		textures.set(null);
		loading.set(false);
	};

	return { textures, loading, error, errorReport, reload, resume, dispose };
}
