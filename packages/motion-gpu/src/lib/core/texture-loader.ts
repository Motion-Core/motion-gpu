import type { TextureUpdateMode } from './types';

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
	key: string;
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

function toBodyFingerprint(body: BodyInit | null | undefined): string | null {
	if (body == null) {
		return null;
	}

	if (typeof body === 'string') {
		return `string:${body}`;
	}

	if (body instanceof URLSearchParams) {
		return `urlsearchparams:${body.toString()}`;
	}

	if (typeof FormData !== 'undefined' && body instanceof FormData) {
		const entries = Array.from(body.entries()).map(([key, value]) => `${key}:${String(value)}`);
		return `formdata:${entries.join('&')}`;
	}

	if (body instanceof Blob) {
		return `blob:${body.type}:${body.size}`;
	}

	if (body instanceof ArrayBuffer) {
		return `arraybuffer:${body.byteLength}`;
	}

	if (ArrayBuffer.isView(body)) {
		return `view:${body.byteLength}`;
	}

	return `opaque:${Object.prototype.toString.call(body)}`;
}

function normalizeRequestInit(requestInit: RequestInit | undefined): Record<string, unknown> {
	if (!requestInit) {
		return {};
	}

	const headers = new Headers(requestInit.headers);
	const headerEntries = Array.from(headers.entries()).sort(([a], [b]) => a.localeCompare(b));
	const normalized: Record<string, unknown> = {};

	normalized.method = (requestInit.method ?? 'GET').toUpperCase();
	normalized.mode = requestInit.mode ?? null;
	normalized.cache = requestInit.cache ?? null;
	normalized.credentials = requestInit.credentials ?? null;
	normalized.redirect = requestInit.redirect ?? null;
	normalized.referrer = requestInit.referrer ?? null;
	normalized.referrerPolicy = requestInit.referrerPolicy ?? null;
	normalized.integrity = requestInit.integrity ?? null;
	normalized.keepalive = requestInit.keepalive ?? false;
	normalized.priority = requestInit.priority ?? null;
	normalized.headers = headerEntries;
	normalized.body = toBodyFingerprint(requestInit.body);

	return normalized;
}

function normalizeTextureLoadOptions(options: TextureLoadOptions): NormalizedTextureLoadOptions {
	const colorSpace = options.colorSpace ?? 'srgb';

	return {
		colorSpace,
		requestInit: options.requestInit,
		decode: {
			colorSpaceConversion:
				options.decode?.colorSpaceConversion ?? (colorSpace === 'linear' ? 'none' : 'default'),
			premultiplyAlpha: options.decode?.premultiplyAlpha ?? 'default',
			imageOrientation: options.decode?.imageOrientation ?? 'none'
		},
		signal: options.signal,
		update: options.update,
		flipY: options.flipY,
		premultipliedAlpha: options.premultipliedAlpha,
		generateMipmaps: options.generateMipmaps
	};
}

/**
 * Builds deterministic resource cache key from full URL IO config.
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
	resourceCache.clear();
}

function acquireTextureBlob(
	url: string,
	options: TextureLoadOptions
): {
	entry: TextureResourceCacheEntry;
	release: () => void;
} {
	const key = buildTextureResourceCacheKey(url, options);
	const existing = resourceCache.get(key);
	if (existing) {
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
				if (existing.refs === 0 && !existing.settled) {
					existing.controller.abort();
					resourceCache.delete(key);
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
				resourceCache.delete(key);
				throw error;
			})
	};

	resourceCache.set(key, entry);
	let released = false;
	return {
		entry,
		release: () => {
			if (released) {
				return;
			}
			released = true;
			entry.refs = Math.max(0, entry.refs - 1);
			if (entry.refs === 0 && !entry.settled) {
				entry.controller.abort();
				resourceCache.delete(key);
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
	const { entry, release } = acquireTextureBlob(url, options);
	let bitmap: ImageBitmap | null = null;

	try {
		const blob = await awaitWithAbort(entry.blobPromise, normalized.signal);

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

		if (normalized.signal?.aborted) {
			bitmap.close();
			throw createAbortError();
		}

		return {
			url,
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			colorSpace: normalized.colorSpace,
			update: normalized.update,
			flipY: normalized.flipY,
			premultipliedAlpha: normalized.premultipliedAlpha,
			generateMipmaps: normalized.generateMipmaps,
			dispose: () => {
				bitmap?.close();
			}
		};
	} catch (error) {
		if (bitmap) {
			bitmap.close();
		}
		throw error;
	} finally {
		release();
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
	const settled = await Promise.allSettled(urls.map((url) => loadTextureFromUrl(url, options)));
	const loaded: LoadedTexture[] = [];
	let firstError: unknown = null;

	for (const entry of settled) {
		if (entry.status === 'fulfilled') {
			loaded.push(entry.value);
			continue;
		}

		firstError ??= entry.reason;
	}

	if (firstError) {
		for (const texture of loaded) {
			texture.dispose();
		}
		throw firstError;
	}

	return loaded;
}
