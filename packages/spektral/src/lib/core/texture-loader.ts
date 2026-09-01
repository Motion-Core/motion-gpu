import type { TextureUpdateMode } from './types.js';

/**
 * Options controlling bitmap decode behavior.
 */
export interface TextureDecodeOptions {
	/**
	 * Controls color-space conversion during decode.
	 */
	colorSpaceConversion?: 'default' | 'none';
	/**
	 * Controls alpha premultiplication during decode.
	 */
	premultiplyAlpha?: 'default' | 'none' | 'premultiply';
	/**
	 * Controls bitmap orientation during decode.
	 */
	imageOrientation?: 'none' | 'flipY';
}

/**
 * Options controlling URL-based texture loading and decode behavior.
 */
export interface TextureLoadOptions {
	/**
	 * Desired texture color space.
	 */
	colorSpace?: 'srgb' | 'linear';
	/**
	 * Fetch options forwarded to `fetch`.
	 */
	requestInit?: RequestInit;
	/**
	 * Decode options forwarded to `createImageBitmap`.
	 */
	decode?: TextureDecodeOptions;
	/**
	 * Optional cancellation signal for this request.
	 */
	signal?: AbortSignal;
	/**
	 * Optional runtime update strategy metadata attached to loaded textures.
	 */
	update?: TextureUpdateMode;
	/**
	 * Optional runtime flip-y metadata attached to loaded textures.
	 */
	flipY?: boolean;
	/**
	 * Optional runtime premultiplied-alpha metadata attached to loaded textures.
	 */
	premultipliedAlpha?: boolean;
	/**
	 * Optional runtime mipmap metadata attached to loaded textures.
	 */
	generateMipmaps?: boolean;
}

/**
 * Loaded texture payload returned by URL loaders.
 */
export interface LoadedTexture {
	/**
	 * Source URL.
	 */
	url: string;
	/**
	 * Decoded bitmap source.
	 */
	source: ImageBitmap;
	/**
	 * Bitmap width in pixels.
	 */
	width: number;
	/**
	 * Bitmap height in pixels.
	 */
	height: number;
	/**
	 * Effective color space.
	 */
	colorSpace: 'srgb' | 'linear';
	/**
	 * Effective runtime update strategy.
	 */
	update?: TextureUpdateMode;
	/**
	 * Effective runtime flip-y metadata.
	 */
	flipY?: boolean;
	/**
	 * Effective runtime premultiplied-alpha metadata.
	 */
	premultipliedAlpha?: boolean;
	/**
	 * Effective runtime mipmap metadata.
	 */
	generateMipmaps?: boolean;
	/**
	 * Releases bitmap resources.
	 */
	dispose: () => void;
}

export interface MergedAbortSignal {
	signal: AbortSignal;
	dispose: () => void;
}

interface NormalizedTextureLoadOptions {
	colorSpace: 'srgb' | 'linear';
	requestInit?: RequestInit;
	decode: Required<TextureDecodeOptions>;
	signal?: AbortSignal;
	update?: TextureUpdateMode;
	flipY?: boolean;
	premultipliedAlpha?: boolean;
	generateMipmaps?: boolean;
}

interface TextureResourceCacheEntry {
	key: string | null;
	refs: number;
	controller: AbortController;
	settled: boolean;
	blobPromise: Promise<Blob>;
}

const resourceCache = new Map<string, TextureResourceCacheEntry>();

function createAbortError(): Error {
	try {
		return new DOMException('Texture request was aborted', 'AbortError');
	} catch {
		const error = new Error('Texture request was aborted');
		(error as Error & { name: string }).name = 'AbortError';
		return error;
	}
}

/**
 * Checks whether error represents abort cancellation.
 */
export function isAbortError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
	);
}

export function mergeAbortSignals(
	primary: AbortSignal,
	...secondarySignals: Array<AbortSignal | null | undefined>
): MergedAbortSignal {
	const signals = [primary, ...secondarySignals].filter(
		(signal): signal is AbortSignal => signal != null
	);
	if (signals.length === 1) {
		return {
			signal: primary,
			dispose: () => {}
		};
	}

	if (typeof AbortSignal.any === 'function') {
		return {
			signal: AbortSignal.any(signals),
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
		for (const signal of signals) {
			signal.removeEventListener('abort', abort);
		}
	};
	const abort = (): void => {
		if (!fallback.signal.aborted) {
			fallback.abort();
		}
		cleanup();
	};

	if (signals.some((signal) => signal.aborted)) {
		fallback.abort();
		return {
			signal: fallback.signal,
			dispose: () => {}
		};
	}

	for (const signal of signals) {
		signal.addEventListener('abort', abort, { once: true });
	}

	return { signal: fallback.signal, dispose: cleanup };
}

function canShareTextureRequest(requestInit: RequestInit | undefined): boolean {
	const method = (requestInit?.method ?? 'GET').toUpperCase();
	return (method === 'GET' || method === 'HEAD') && requestInit?.body == null;
}

function normalizeRequestInit(requestInit: RequestInit | undefined): Record<string, unknown> {
	const headers = new Headers(requestInit?.headers);
	const headerEntries = Array.from(headers.entries()).sort(([a], [b]) => a.localeCompare(b));
	const normalized: Record<string, unknown> = {};

	normalized.method = (requestInit?.method ?? 'GET').toUpperCase();
	normalized.mode = requestInit?.mode ?? null;
	normalized.cache = requestInit?.cache ?? null;
	normalized.credentials = requestInit?.credentials ?? null;
	normalized.redirect = requestInit?.redirect ?? null;
	normalized.referrer = requestInit?.referrer ?? null;
	normalized.referrerPolicy = requestInit?.referrerPolicy ?? null;
	normalized.integrity = requestInit?.integrity ?? null;
	normalized.keepalive = requestInit?.keepalive ?? false;
	normalized.priority = requestInit?.priority ?? null;
	normalized.headers = headerEntries;

	return normalized;
}

function withoutRequestSignal(requestInit: RequestInit | undefined): RequestInit | undefined {
	if (!requestInit || requestInit.signal == null) {
		return requestInit;
	}

	const rest = { ...requestInit };
	delete rest.signal;
	return rest;
}

function mergeTextureClientSignals(
	options: NormalizedTextureLoadOptions
): MergedAbortSignal | null {
	const primary = options.signal ?? options.requestInit?.signal;
	if (!primary) {
		return null;
	}

	return mergeAbortSignals(
		primary,
		options.signal === undefined ? undefined : options.requestInit?.signal
	);
}

function normalizeTextureLoadOptions(options: TextureLoadOptions): NormalizedTextureLoadOptions {
	const colorSpace = options.colorSpace ?? 'srgb';

	const normalized: NormalizedTextureLoadOptions = {
		colorSpace,
		decode: {
			colorSpaceConversion:
				options.decode?.colorSpaceConversion ?? (colorSpace === 'linear' ? 'none' : 'default'),
			premultiplyAlpha: options.decode?.premultiplyAlpha ?? 'default',
			imageOrientation: options.decode?.imageOrientation ?? 'none'
		}
	};

	if (options.requestInit !== undefined) {
		normalized.requestInit = options.requestInit;
	}
	if (options.signal !== undefined) {
		normalized.signal = options.signal;
	}
	if (options.update !== undefined) {
		normalized.update = options.update;
	}
	if (options.flipY !== undefined) {
		normalized.flipY = options.flipY;
	}
	if (options.premultipliedAlpha !== undefined) {
		normalized.premultipliedAlpha = options.premultipliedAlpha;
	}
	if (options.generateMipmaps !== undefined) {
		normalized.generateMipmaps = options.generateMipmaps;
	}

	return normalized;
}

/**
 * Builds a deterministic resource cache key for cache-eligible URL IO config.
 */
export function buildTextureResourceCacheKey(
	url: string,
	options: TextureLoadOptions = {}
): string {
	const normalized = normalizeTextureLoadOptions(options);
	return JSON.stringify({
		url,
		colorSpace: normalized.colorSpace,
		requestInit: normalizeRequestInit(normalized.requestInit),
		decode: normalized.decode
	});
}

/**
 * Clears the internal texture resource cache.
 */
export function clearTextureBlobCache(): void {
	for (const entry of resourceCache.values()) {
		if (!entry.settled) {
			entry.controller.abort();
		}
	}
	resourceCache.clear();
}

function acquireTextureBlob(
	url: string,
	options: TextureLoadOptions
): {
	entry: TextureResourceCacheEntry;
	release: () => void;
} {
	const key = canShareTextureRequest(options.requestInit)
		? buildTextureResourceCacheKey(url, options)
		: null;
	const existing = key === null ? undefined : resourceCache.get(key);
	if (existing && key !== null) {
		existing.refs += 1;
		let released = false;
		return {
			entry: existing,
			release: () => {
				if (released) {
					return;
				}
				released = true;
				existing.refs = Math.max(0, existing.refs - 1);
				if (existing.refs === 0) {
					if (!existing.settled) {
						existing.controller.abort();
					}
					if (resourceCache.get(key) === existing) {
						resourceCache.delete(key);
					}
				}
			}
		};
	}

	const normalized = normalizeTextureLoadOptions(options);
	const controller = new AbortController();
	const requestInit = {
		...(normalized.requestInit ?? {}),
		signal: controller.signal
	} satisfies RequestInit;
	const entry: TextureResourceCacheEntry = {
		key,
		refs: 1,
		controller,
		settled: false,
		blobPromise: fetch(url, requestInit)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Texture request failed (${response.status}) for ${url}`);
				}
				return response.blob();
			})
			.then((blob) => {
				entry.settled = true;
				return blob;
			})
			.catch((error) => {
				if (key !== null && resourceCache.get(key) === entry) {
					resourceCache.delete(key);
				}
				throw error;
			})
	};

	if (key !== null) {
		resourceCache.set(key, entry);
	}
	let released = false;
	return {
		entry,
		release: () => {
			if (released) {
				return;
			}
			released = true;
			entry.refs = Math.max(0, entry.refs - 1);
			if (entry.refs === 0) {
				if (!entry.settled) {
					entry.controller.abort();
				}
				if (key !== null && resourceCache.get(key) === entry) {
					resourceCache.delete(key);
				}
			}
		}
	};
}

async function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (!signal) {
		return promise;
	}

	if (signal.aborted) {
		throw createAbortError();
	}

	return new Promise<T>((resolve, reject) => {
		const onAbort = (): void => {
			reject(createAbortError());
		};

		signal.addEventListener('abort', onAbort, { once: true });

		promise.then(resolve, reject).finally(() => {
			signal.removeEventListener('abort', onAbort);
		});
	});
}

/**
 * Loads a single texture from URL and converts it to an `ImageBitmap`.
 *
 * @param url - Texture URL.
 * @param options - Loading options.
 * @returns Loaded texture object.
 * @throws {Error} When runtime does not support `createImageBitmap` or request fails.
 */
export async function loadTextureFromUrl(
	url: string,
	options: TextureLoadOptions = {}
): Promise<LoadedTexture> {
	if (typeof createImageBitmap !== 'function') {
		throw new Error('createImageBitmap is not available in this runtime');
	}

	const normalized = normalizeTextureLoadOptions(options);
	const clientSignal = mergeTextureClientSignals(normalized);
	let release: (() => void) | null = null;
	let bitmap: ImageBitmap | null = null;

	try {
		if (clientSignal?.signal.aborted) {
			throw createAbortError();
		}
		const acquired = acquireTextureBlob(url, options);
		release = acquired.release;
		const blob = await awaitWithAbort(acquired.entry.blobPromise, clientSignal?.signal);

		const bitmapOptions: ImageBitmapOptions = {
			colorSpaceConversion: normalized.decode.colorSpaceConversion,
			premultiplyAlpha: normalized.decode.premultiplyAlpha,
			imageOrientation: normalized.decode.imageOrientation
		};
		const allDefaults =
			bitmapOptions.colorSpaceConversion === 'default' &&
			bitmapOptions.premultiplyAlpha === 'default' &&
			bitmapOptions.imageOrientation === 'none';

		bitmap = allDefaults
			? await createImageBitmap(blob)
			: await createImageBitmap(blob, bitmapOptions);

		if (clientSignal?.signal.aborted) {
			bitmap.close();
			bitmap = null;
			throw createAbortError();
		}

		let disposed = false;
		const loaded: LoadedTexture = {
			url,
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			colorSpace: normalized.colorSpace,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				bitmap?.close();
				bitmap = null;
			}
		};

		if (normalized.update !== undefined) {
			loaded.update = normalized.update;
		}
		if (normalized.flipY !== undefined) {
			loaded.flipY = normalized.flipY;
		}
		if (normalized.premultipliedAlpha !== undefined) {
			loaded.premultipliedAlpha = normalized.premultipliedAlpha;
		}
		if (normalized.generateMipmaps !== undefined) {
			loaded.generateMipmaps = normalized.generateMipmaps;
		}

		return loaded;
	} catch (error) {
		if (bitmap) {
			bitmap.close();
		}
		throw error;
	} finally {
		release?.();
		clientSignal?.dispose();
	}
}

/**
 * Loads many textures in parallel from URLs.
 *
 * @param urls - Texture URLs.
 * @param options - Shared loading options.
 * @returns Promise resolving to loaded textures in input order.
 */
export async function loadTexturesFromUrls(
	urls: string[],
	options: TextureLoadOptions = {}
): Promise<LoadedTexture[]> {
	const loaded: LoadedTexture[] = [];
	const batchController = new AbortController();
	const mergedSignal = mergeAbortSignals(
		batchController.signal,
		options.signal,
		options.requestInit?.signal
	);
	const requestInit = withoutRequestSignal(options.requestInit);
	const abortBatch = (): void => {
		if (!batchController.signal.aborted) {
			batchController.abort();
		}
	};

	let failed = false;

	try {
		const loadPromises = urls.map(async (url) => {
			const texture = await loadTextureFromUrl(url, {
				...options,
				...(requestInit !== undefined ? { requestInit } : {}),
				signal: mergedSignal.signal
			});
			if (failed) {
				texture.dispose();
				throw createAbortError();
			}
			loaded.push(texture);
			return texture;
		});

		return await Promise.all(loadPromises);
	} catch (error) {
		failed = true;
		abortBatch();
		for (const texture of loaded) {
			texture.dispose();
		}
		throw error;
	} finally {
		mergedSignal.dispose();
	}
}
