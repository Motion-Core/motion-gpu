import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextureBlobCache } from './core/texture-loader';
import type { UseTextureResult } from './use-texture';
import TextureHookProbe from './test-fixtures/TextureHookProbe.svelte';

interface MockBitmap {
	width: number;
	height: number;
	close: ReturnType<typeof vi.fn>;
}

describe('useTexture', () => {
	const bitmaps: MockBitmap[] = [];

	beforeEach(() => {
		clearTextureBlobCache();
		bitmaps.length = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
			}))
		);
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => {
				const bitmap: MockBitmap = {
					width: 24,
					height: 24,
					close: vi.fn()
				};
				bitmaps.push(bitmap);
				return bitmap;
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('loads textures and exposes hook state', async () => {
		const onProbe = vi.fn();
		render(TextureHookProbe, {
			props: {
				urls: ['/assets/a.png', '/assets/b.png'],
				onProbe
			}
		});

		await waitFor(() => {
			const result = onProbe.mock.calls[0]?.[0] as UseTextureResult;
			expect(result.loading.current).toBe(false);
			expect(result.error.current).toBeNull();
			expect(result.textures.current).toHaveLength(2);
		});
	});

	it('disposes bitmaps when component unmounts', async () => {
		const onProbe = vi.fn();
		const view = render(TextureHookProbe, {
			props: {
				urls: ['/assets/dispose.png'],
				onProbe
			}
		});

		await waitFor(() => {
			const result = onProbe.mock.calls[0]?.[0] as UseTextureResult;
			expect(result.loading.current).toBe(false);
			expect(result.textures.current).toHaveLength(1);
		});

		view.unmount();
		expect(bitmaps[0]?.close).toHaveBeenCalledTimes(1);
	});
});
