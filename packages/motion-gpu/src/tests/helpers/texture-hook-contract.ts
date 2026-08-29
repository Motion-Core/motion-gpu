import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../../lib/core/current-value.js';
import type { MotionGPUErrorReport } from '../../lib/core/error-report.js';
import {
	clearTextureBlobCache,
	type LoadedTexture,
	type TextureLoadOptions
} from '../../lib/core/texture-loader.js';

export interface TextureHookResult {
	textures: CurrentReadable<LoadedTexture[] | null>;
	loading: CurrentReadable<boolean>;
	error: CurrentReadable<Error | null>;
	errorReport: CurrentReadable<MotionGPUErrorReport | null>;
	reload: () => Promise<void>;
}

export interface MountedTextureHook {
	getResult: () => TextureHookResult | undefined;
	rerender: (urls: string[]) => Promise<void>;
	unmount: () => void;
}

export interface TextureHookContractDriver {
	framework: string;
	mount: (urls: string[], options?: TextureLoadOptions) => MountedTextureHook;
	waitFor: (assertion: () => void | Promise<void>) => Promise<void>;
}

interface MockBitmap {
	width: number;
	height: number;
	close: ReturnType<typeof vi.fn>;
}

function createAbortError(): DOMException {
	return new DOMException('Aborted', 'AbortError');
}

function requireResult(view: MountedTextureHook): TextureHookResult {
	const result = view.getResult();
	if (!result) throw new Error('Expected hook result');
	return result;
}

/** Registers the complete adapter-neutral texture hook behavior contract. */
export function defineTextureHookContract({
	framework,
	mount,
	waitFor
}: TextureHookContractDriver): void {
	describe(`${framework} useTexture`, () => {
		const bitmaps: MockBitmap[] = [];

		beforeEach(() => {
			clearTextureBlobCache();
			bitmaps.length = 0;
			vi.stubGlobal(
				'createImageBitmap',
				vi.fn(async () => {
					const bitmap: MockBitmap = { width: 24, height: 24, close: vi.fn() };
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
			const view = mount(['/assets/a.png', '/assets/b.png']);

			await waitFor(() => {
				const result = requireResult(view);
				expect(result.loading.current).toBe(false);
				expect(result.error.current).toBeNull();
				expect(result.errorReport.current).toBeNull();
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
						setTimeout(
							() => {
								signal?.removeEventListener('abort', onAbort);
								resolve({
									ok: true,
									status: 200,
									blob: async () =>
										new Blob([new Uint8Array(current === 1 ? [1, 2, 3, 4] : [5, 6, 7, 8])], {
											type: 'image/png'
										})
								});
							},
							current === 1 ? 100 : 10
						);
					});
				})
			);
			const view = mount(['/assets/reload.png']);
			await waitFor(() => expect(view.getResult()).toBeDefined());

			void requireResult(view).reload();

			await waitFor(() => {
				const result = requireResult(view);
				expect(result.loading.current).toBe(false);
				expect(result.error.current).toBeNull();
				expect(result.textures.current).toHaveLength(1);
			});
			expect(aborts).toContain(1);
		});

		it('starts a fresh load when reload is called after a previous request settled', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async (url: string) =>
					url === '/assets/initial.png'
						? {
								ok: true,
								status: 200,
								blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
							}
						: {
								ok: false,
								status: 404,
								blob: async () => new Blob([new Uint8Array([0])], { type: 'text/plain' })
							}
				)
			);
			const view = mount(['/assets/initial.png']);

			await waitFor(() => {
				const result = requireResult(view);
				expect(result.loading.current).toBe(false);
				expect(result.error.current).toBeNull();
				expect(result.textures.current).toHaveLength(1);
			});

			const result = requireResult(view);
			await view.rerender(['/assets/missing.png']);
			await result.reload();

			await waitFor(() => {
				expect(result.loading.current).toBe(false);
				expect(result.textures.current).toBeNull();
				expect(result.error.current?.message).toContain('/assets/missing.png');
				expect(result.errorReport.current?.code).toBe('TEXTURE_REQUEST_FAILED');
				expect(result.errorReport.current?.rawMessage).toContain('/assets/missing.png');
			});
			expect(fetch).toHaveBeenCalledWith('/assets/missing.png', expect.any(Object));
		});

		it('cancels in-flight load on unmount', async () => {
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
			const view = mount(['/assets/dispose.png']);
			await waitFor(() => expect(view.getResult()).toBeDefined());

			view.unmount();
			await waitFor(() => expect(aborted).toBe(true));
		});

		it('disposes loaded bitmaps on unmount', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({
					ok: true,
					status: 200,
					blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
				}))
			);
			const view = mount(['/assets/dispose-loaded.png']);

			await waitFor(() => {
				expect(bitmaps).toHaveLength(1);
				expect(requireResult(view).textures.current).toHaveLength(1);
			});
			view.unmount();

			expect(bitmaps[0]?.close).toHaveBeenCalledTimes(1);
		});

		it('shares in-flight blob requests across concurrent hook instances', async () => {
			let resolveFetch!: () => void;
			const fetchPromise = new Promise<{
				ok: boolean;
				status: number;
				blob: () => Promise<Blob>;
			}>((resolve) => {
				resolveFetch = () =>
					resolve({
						ok: true,
						status: 200,
						blob: async () => new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' })
					});
			});
			vi.stubGlobal(
				'fetch',
				vi.fn(() => fetchPromise)
			);
			const first = mount(['/assets/shared-hook.png']);
			const second = mount(['/assets/shared-hook.png']);

			await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
			resolveFetch();

			await waitFor(() => {
				for (const view of [first, second]) {
					const result = requireResult(view);
					expect(result.loading.current).toBe(false);
					expect(result.textures.current).toHaveLength(1);
				}
			});
			expect(createImageBitmap).toHaveBeenCalledTimes(2);
		});

		it('supports merged abort signal fallback when AbortSignal.any is unavailable', async () => {
			const abortSignalRef = AbortSignal as unknown as {
				any: ((signals: AbortSignal[]) => AbortSignal) | undefined;
			};
			const originalAny = abortSignalRef.any;
			abortSignalRef.any = undefined;

			try {
				vi.stubGlobal(
					'fetch',
					vi.fn((_: string, requestInit?: RequestInit) => {
						const signal = requestInit?.signal as AbortSignal | undefined;
						return new Promise((resolve, reject) => {
							if (signal?.aborted) {
								reject(createAbortError());
								return;
							}
							const onAbort = (): void => reject(createAbortError());
							signal?.addEventListener('abort', onAbort, { once: true });
							setTimeout(() => {
								signal?.removeEventListener('abort', onAbort);
								resolve({
									ok: true,
									status: 200,
									blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
								});
							}, 500);
						});
					})
				);
				const controller = new AbortController();
				const view = mount(['/assets/fallback-abort.png'], { signal: controller.signal });
				controller.abort();

				await waitFor(() => {
					const result = requireResult(view);
					expect(result.loading.current).toBe(false);
					expect(result.error.current).toBeNull();
					expect(result.errorReport.current).toBeNull();
					expect(result.textures.current).toBeNull();
				});
			} finally {
				abortSignalRef.any = originalAny;
			}
		});

		it('supports cancellation through requestInit.signal', async () => {
			let aborted = false;
			vi.stubGlobal(
				'fetch',
				vi.fn((_: string, requestInit?: RequestInit) => {
					const signal = requestInit?.signal as AbortSignal | undefined;
					return new Promise((_, reject) => {
						const onAbort = (): void => {
							aborted = true;
							reject(createAbortError());
						};
						signal?.addEventListener('abort', onAbort, { once: true });
					});
				})
			);
			const controller = new AbortController();
			const view = mount(['/assets/request-init-abort.png'], {
				requestInit: { signal: controller.signal }
			});

			await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
			controller.abort();

			await waitFor(() => {
				const result = requireResult(view);
				expect(result.loading.current).toBe(false);
				expect(result.error.current).toBeNull();
				expect(result.errorReport.current).toBeNull();
				expect(result.textures.current).toBeNull();
			});
			expect(aborted).toBe(true);
		});
	});
}
