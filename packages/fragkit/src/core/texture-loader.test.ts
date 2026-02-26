import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextureBlobCache, loadTextureFromUrl, loadTexturesFromUrls } from './texture-loader';

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

	it('loads bitmap textures with dimensions and dispose', async () => {
		const texture = await loadTextureFromUrl('/assets/pic-a.png');
		expect(texture.url).toBe('/assets/pic-a.png');
		expect(texture.width).toBe(32);
		expect(texture.height).toBe(18);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(createImageBitmap).toHaveBeenCalledTimes(1);

		texture.dispose();
		const close = (texture.source as unknown as { close: () => void }).close;
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('reuses cached blob fetches for the same url', async () => {
		await loadTexturesFromUrls(['/assets/shared.png', '/assets/shared.png']);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(createImageBitmap).toHaveBeenCalledTimes(2);
	});

	it('uses linear decode mode when requested', async () => {
		await loadTextureFromUrl('/assets/linear.png', { colorSpace: 'linear' });
		expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
			colorSpaceConversion: 'none'
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
});
