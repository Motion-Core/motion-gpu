import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextureBlobCache } from '../lib/core/texture-loader';
import type { UseTextureResult } from '../lib/use-texture';
import TextureHookProbe from './fixtures/TextureHookProbe.svelte';

interface MockBitmap {
	width: number;
	height: number;
	close: ReturnType<typeof vi.fn>;
}

function createAbortError(): DOMException {
	return new DOMException('Aborted', 'AbortError');
}

describe('useTexture', () => {
	const bitmaps: MockBitmap[] = [];

	beforeEach(() => {
		clearTextureBlobCache();
		bitmaps.length = 0;
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
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
			}))
		);

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

	it('cancels in-flight load on reload and resolves latest request', async () => {
		let call = 0;
		const aborts: number[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((_: string, requestInit?: RequestInit) => {
				const current = ++call;
				const signal = requestInit?.signal as AbortSignal | undefined;
				return new Promise((resolve, reject) => {
					const onAbort = (): void => {
						aborts.push(current);
						reject(createAbortError());
					};
					signal?.addEventListener('abort', onAbort, { once: true });

					if (current === 1) {
						setTimeout(() => {
							signal?.removeEventListener('abort', onAbort);
							resolve({
								ok: true,
								status: 200,
								blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
							});
						}, 100);
						return;
					}

					setTimeout(() => {
						signal?.removeEventListener('abort', onAbort);
						resolve({
							ok: true,
							status: 200,
							blob: async () => new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'image/png' })
						});
					}, 10);
				});
			})
		);

		const onProbe = vi.fn();
		render(TextureHookProbe, {
			props: {
				urls: ['/assets/reload.png'],
				onProbe
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalled();
		});

		const result = onProbe.mock.calls[0]?.[0] as UseTextureResult;
		void result.reload();

		await waitFor(() => {
			expect(result.loading.current).toBe(false);
			expect(result.error.current).toBeNull();
			expect(result.textures.current).toHaveLength(1);
		});

		expect(aborts).toContain(1);
	});

	it('cancels in-flight load and disposes bitmaps on unmount', async () => {
		let aborted = false;
		vi.stubGlobal(
			'fetch',
			vi.fn((_: string, requestInit?: RequestInit) => {
				const signal = requestInit?.signal as AbortSignal | undefined;
				return new Promise((resolve, reject) => {
					const onAbort = (): void => {
						aborted = true;
						reject(createAbortError());
					};
					signal?.addEventListener('abort', onAbort, { once: true });
					setTimeout(() => {
						signal?.removeEventListener('abort', onAbort);
						resolve({
							ok: true,
							status: 200,
							blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
						});
					}, 100);
				});
			})
		);

		const onProbe = vi.fn();
		const view = render(TextureHookProbe, {
			props: {
				urls: ['/assets/dispose.png'],
				onProbe
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalled();
		});

		view.unmount();
		await waitFor(() => {
			expect(aborted).toBe(true);
		});
		for (const bitmap of bitmaps) {
			expect(bitmap.close).toHaveBeenCalledTimes(1);
		}
	});
});
