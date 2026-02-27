import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildTextureResourceCacheKey,
	clearTextureBlobCache,
	isAbortError,
	loadTextureFromUrl,
	loadTexturesFromUrls
} from '../../lib/core/texture-loader';

function createMockBlob(): Blob {
	return new Blob([new Uint8Array([255, 0, 0, 255])], { type: 'image/png' });
}

describe('texture-loader', () => {
	beforeEach(() => {
		clearTextureBlobCache();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				blob: async () => createMockBlob()
			}))
		);
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => ({
				width: 32,
				height: 18,
				close: vi.fn()
			}))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('loads bitmap textures with dimensions, metadata and dispose', async () => {
		const texture = await loadTextureFromUrl('/assets/pic-a.png', {
			colorSpace: 'linear',
			update: 'onInvalidate',
			flipY: false,
			premultipliedAlpha: true,
			generateMipmaps: true
		});
		expect(texture.url).toBe('/assets/pic-a.png');
		expect(texture.width).toBe(32);
		expect(texture.height).toBe(18);
		expect(texture.colorSpace).toBe('linear');
		expect(texture.update).toBe('onInvalidate');
		expect(texture.flipY).toBe(false);
		expect(texture.premultipliedAlpha).toBe(true);
		expect(texture.generateMipmaps).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(createImageBitmap).toHaveBeenCalledTimes(1);

		texture.dispose();
		const close = (texture.source as unknown as { close: () => void }).close;
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('reuses cached fetches only when full cache key matches', async () => {
		await loadTexturesFromUrls(['/assets/shared.png', '/assets/shared.png'], {
			requestInit: {
				method: 'GET',
				headers: { accept: 'image/png' }
			},
			colorSpace: 'srgb'
		});
		await loadTextureFromUrl('/assets/shared.png', {
			requestInit: {
				method: 'GET',
				headers: { accept: 'image/png' }
			},
			colorSpace: 'linear'
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(createImageBitmap).toHaveBeenCalledTimes(3);
	});

	it('uses decode options and linear decode mode when requested', async () => {
		await loadTextureFromUrl('/assets/linear.png', {
			colorSpace: 'linear',
			decode: {
				imageOrientation: 'flipY',
				premultiplyAlpha: 'premultiply'
			}
		});
		expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
			colorSpaceConversion: 'none',
			premultiplyAlpha: 'premultiply',
			imageOrientation: 'flipY'
		});
	});

	it('clears failed cache entries so retries can succeed', async () => {
		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 500,
			blob: async () => createMockBlob()
		});
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			blob: async () => createMockBlob()
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(loadTextureFromUrl('/assets/retry.png')).rejects.toThrow(
			/Texture request failed \(500\)/
		);
		await expect(loadTextureFromUrl('/assets/retry.png')).resolves.toBeDefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('supports cancellation via AbortController', async () => {
		const fetchMock = vi.fn((_: string, requestInit?: RequestInit) => {
			const signal = requestInit?.signal as AbortSignal | undefined;
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(new DOMException('Aborted', 'AbortError'));
					return;
				}

				const onAbort = (): void => reject(new DOMException('Aborted', 'AbortError'));
				signal?.addEventListener('abort', onAbort, { once: true });
				setTimeout(() => {
					signal?.removeEventListener('abort', onAbort);
					resolve({
						ok: true,
						status: 200,
						blob: async () => createMockBlob()
					});
				}, 50);
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		const controller = new AbortController();

		const promise = loadTextureFromUrl('/assets/abort.png', { signal: controller.signal });
		controller.abort();
		await expect(promise).rejects.toSatisfy((error: unknown) => isAbortError(error));
	});

	it('builds stable cache keys from full io config', () => {
		const a = buildTextureResourceCacheKey('/assets/sprite.png', {
			colorSpace: 'srgb',
			requestInit: {
				method: 'GET',
				headers: { accept: 'image/png', 'x-test': 'a' }
			},
			decode: {
				imageOrientation: 'flipY'
			}
		});
		const b = buildTextureResourceCacheKey('/assets/sprite.png', {
			colorSpace: 'srgb',
			requestInit: {
				headers: { 'x-test': 'a', accept: 'image/png' },
				method: 'GET'
			},
			decode: {
				imageOrientation: 'flipY'
			}
		});
		const c = buildTextureResourceCacheKey('/assets/sprite.png', {
			colorSpace: 'linear',
			requestInit: {
				method: 'GET',
				headers: { accept: 'image/png', 'x-test': 'a' }
			},
			decode: {
				imageOrientation: 'flipY'
			}
		});

		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});
});
