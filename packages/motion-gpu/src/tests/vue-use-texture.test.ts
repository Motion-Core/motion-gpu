import { render, waitFor } from '@testing-library/vue';
import { defineComponent, onMounted, type PropType } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextureBlobCache } from '../lib/core/texture-loader.js';
import { useTexture, type UseTextureResult } from '../lib/vue/use-texture.js';

interface MockBitmap {
	width: number;
	height: number;
	close: ReturnType<typeof vi.fn>;
}

const TextureProbe = defineComponent({
	name: 'VueTextureProbe',
	props: {
		urls: {
			type: Array as PropType<string[]>,
			required: true
		},
		onProbe: {
			type: Function as PropType<(value: UseTextureResult) => void>,
			required: true
		},
		options: {
			type: Object as PropType<Parameters<typeof useTexture>[1]>,
			default: () => ({})
		}
	},
	setup(props) {
		const result = useTexture(() => props.urls, props.options ?? {});

		onMounted(() => {
			props.onProbe(result);
		});

		return () => null;
	}
});

function createAbortError(): DOMException {
	return new DOMException('Aborted', 'AbortError');
}

function getProbeResult(onProbe: ReturnType<typeof vi.fn>, index = 0): UseTextureResult {
	const result = onProbe.mock.calls[index]?.[0] as UseTextureResult | undefined;
	if (!result) {
		throw new Error('Expected hook result');
	}

	return result;
}

describe('vue useTexture', () => {
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
		render(TextureProbe, { props: { urls: ['/assets/a.png', '/assets/b.png'], onProbe } });

		await waitFor(() => {
			const result = getProbeResult(onProbe);
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

					if (current === 1) {
						setTimeout(() => {
							signal?.removeEventListener('abort', onAbort);
							resolve({
								ok: true,
								status: 200,
								blob: async () =>
									new Blob([new Uint8Array([1, 2, 3, 4])], {
										type: 'image/png'
									})
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
		render(TextureProbe, { props: { urls: ['/assets/reload.png'], onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalled();
		});

		const result = getProbeResult(onProbe);
		void result.reload();

		await waitFor(() => {
			expect(result.loading.current).toBe(false);
			expect(result.error.current).toBeNull();
			expect(result.textures.current).toHaveLength(1);
		});

		expect(aborts).toContain(1);
	});

	it('starts a fresh load when reload is called after a previous request settled', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url === '/assets/initial.png') {
					return {
						ok: true,
						status: 200,
						blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
					};
				}

				return {
					ok: false,
					status: 404,
					blob: async () => new Blob([new Uint8Array([0])], { type: 'text/plain' })
				};
			})
		);

		const onProbe = vi.fn();
		const view = render(TextureProbe, {
			props: {
				urls: ['/assets/initial.png'],
				onProbe
			}
		});

		await waitFor(() => {
			const result = getProbeResult(onProbe);
			expect(result.loading.current).toBe(false);
			expect(result.error.current).toBeNull();
			expect(result.textures.current).toHaveLength(1);
		});

		const result = getProbeResult(onProbe);
		await view.rerender({ urls: ['/assets/missing.png'], onProbe });
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
		const view = render(TextureProbe, { props: { urls: ['/assets/dispose.png'], onProbe } });

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

		const onProbeA = vi.fn();
		const onProbeB = vi.fn();
		render(TextureProbe, { props: { urls: ['/assets/shared-hook.png'], onProbe: onProbeA } });
		render(TextureProbe, { props: { urls: ['/assets/shared-hook.png'], onProbe: onProbeB } });

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
		});
		resolveFetch();

		await waitFor(() => {
			const resultA = getProbeResult(onProbeA);
			const resultB = getProbeResult(onProbeB);
			expect(resultA.loading.current).toBe(false);
			expect(resultB.loading.current).toBe(false);
			expect(resultA.textures.current).toHaveLength(1);
			expect(resultB.textures.current).toHaveLength(1);
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

			let result: UseTextureResult | undefined;
			const onProbe = vi.fn((value: UseTextureResult) => {
				result = value;
			});
			const controller = new AbortController();
			render(TextureProbe, {
				props: {
					urls: ['/assets/fallback-abort.png'],
					onProbe,
					options: { signal: controller.signal }
				}
			});
			controller.abort();

			await waitFor(() => {
				expect(result).not.toBeNull();
				expect(result?.loading.current).toBe(false);
			});

			const resolvedResult = result;
			if (!resolvedResult) {
				throw new Error('Expected hook result');
			}
			expect(resolvedResult.error.current).toBeNull();
			expect(resolvedResult.errorReport.current).toBeNull();
			expect(resolvedResult.textures.current).toBeNull();
		} finally {
			abortSignalRef.any = originalAny;
		}
	});
});
