import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextureBlobCache } from '../lib/core/texture-loader';

const { onMountCallbacks, onDestroyCallbacks } = vi.hoisted(() => ({
	onMountCallbacks: [] as Array<() => void>,
	onDestroyCallbacks: [] as Array<() => void>
}));

vi.mock('svelte', () => ({
	onMount: vi.fn((callback: () => void) => {
		onMountCallbacks.push(callback);
	}),
	onDestroy: vi.fn((callback: () => void) => {
		onDestroyCallbacks.push(callback);
	})
}));

import { useTexture } from '../lib/svelte/use-texture';

describe('svelte useTexture SSR safety', () => {
	beforeEach(() => {
		clearTextureBlobCache();
		onMountCallbacks.length = 0;
		onDestroyCallbacks.length = 0;
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
		expect(onMountCallbacks).toHaveLength(1);

		onMountCallbacks[0]?.();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
