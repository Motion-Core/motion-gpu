import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextureBlobCache } from '../lib/core/texture-loader.js';

const { onMountedCallbacks, onBeforeUnmountCallbacks } = vi.hoisted(() => ({
	onMountedCallbacks: [] as Array<() => void>,
	onBeforeUnmountCallbacks: [] as Array<() => void>
}));

vi.mock('vue', async () => {
	const actual = await vi.importActual<typeof import('vue')>('vue');
	return {
		...actual,
		onMounted: vi.fn((callback: () => void) => {
			onMountedCallbacks.push(callback);
		}),
		onBeforeUnmount: vi.fn((callback: () => void) => {
			onBeforeUnmountCallbacks.push(callback);
		})
	};
});

import { useTexture } from '../lib/vue/use-texture.js';

describe('vue useTexture SSR safety', () => {
	beforeEach(() => {
		clearTextureBlobCache();
		onMountedCallbacks.length = 0;
		onBeforeUnmountCallbacks.length = 0;
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => ({
				width: 24,
				height: 24,
				close: vi.fn()
			}))
		);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
			}))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('does not start browser texture IO before client mount', async () => {
		useTexture(['/assets/ssr-safe.png']);
		await Promise.resolve();

		expect(fetch).not.toHaveBeenCalled();
		expect(onMountedCallbacks).toHaveLength(1);

		onMountedCallbacks[0]?.();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
