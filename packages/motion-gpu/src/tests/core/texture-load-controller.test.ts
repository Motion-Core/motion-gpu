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
		expect(controller.textures.current).toBeNull();
		expect(controller.loading.current).toBe(false);
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
		expect(controller.loading.current).toBe(false);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('queues a reload during an in-flight decode and retains only the latest result', async () => {
		const resolvers: Array<(bitmap: { width: number; height: number; close: () => void }) => void> =
			[];
		const firstClose = vi.fn();
		const secondClose = vi.fn();
		let urlVersion = 0;
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
						resolvers.push(resolve);
					})
			)
		);
		const controller = createTextureLoadController({
			getUrls: () => [`/assets/reload-${++urlVersion}.png`],
			getOptions: () => ({})
		});

		const firstReload = controller.reload();
		await vi.waitFor(() => expect(resolvers).toHaveLength(1));
		const secondReload = controller.reload();
		resolvers[0]?.({ width: 24, height: 24, close: firstClose });
		await vi.waitFor(() => expect(resolvers).toHaveLength(2));
		resolvers[1]?.({ width: 48, height: 48, close: secondClose });
		await Promise.all([firstReload, secondReload]);

		expect(firstClose).toHaveBeenCalledTimes(1);
		expect(secondClose).not.toHaveBeenCalled();
		expect(controller.textures.current?.[0]).toMatchObject({
			url: '/assets/reload-2.png',
			width: 48,
			height: 48
		});
		expect(controller.loading.current).toBe(false);
	});
});
