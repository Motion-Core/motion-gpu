import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTextureLoadController } from '../../lib/core/texture-load-controller.js';
import { clearTextureBlobCache } from '../../lib/core/texture-loader.js';

describe('createTextureLoadController', () => {
	const close = vi.fn();

	beforeEach(() => {
		clearTextureBlobCache();
		close.mockReset();
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => ({ width: 24, height: 24, close }))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('owns successful load state and disposes the current textures once', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
			}))
		);
		const controller = createTextureLoadController({
			getUrls: () => ['/assets/controller.png'],
			getOptions: () => ({})
		});

		await controller.reload();

		expect(controller.loading.current).toBe(false);
		expect(controller.error.current).toBeNull();
		expect(controller.errorReport.current).toBeNull();
		expect(controller.textures.current?.[0]?.url).toBe('/assets/controller.png');

		controller.dispose();
		controller.dispose();
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('normalizes non-Error failures without exposing stale textures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw 'network failed';
			})
		);
		const controller = createTextureLoadController({
			getUrls: () => ['/assets/failure.png'],
			getOptions: () => ({})
		});

		await controller.reload();

		expect(controller.loading.current).toBe(false);
		expect(controller.textures.current).toBeNull();
		expect(controller.error.current?.message).toBe('Unknown texture loading error');
		expect(controller.errorReport.current?.rawMessage).toBe('Unknown texture loading error');
	});

	it('disposes a result that resolves after the controller is disposed', async () => {
		let resolveBitmap!: (bitmap: { width: number; height: number; close: () => void }) => void;
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
			vi.fn(
				() =>
					new Promise((resolve) => {
						resolveBitmap = resolve;
					})
			)
		);
		const controller = createTextureLoadController({
			getUrls: () => ['/assets/late.png'],
			getOptions: () => ({})
		});
		const pending = controller.reload();

		await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1));
		controller.dispose();
		resolveBitmap({ width: 24, height: 24, close });
		await pending;

		expect(controller.textures.current).toBeNull();
		expect(close).toHaveBeenCalledTimes(1);
	});
});
