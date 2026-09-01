import { render, waitFor } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import type { TextureLoadOptions } from '../lib/core/texture-loader.js';
import { useTexture, type UseTextureResult } from '../lib/react/use-texture.js';
import {
	defineTextureHookContract,
	type MountedTextureHook
} from './helpers/texture-hook-contract.js';

interface TextureProbeProps {
	urls: string[];
	options: TextureLoadOptions;
	onProbe: (value: UseTextureResult) => void;
}

function TextureProbe({ urls, options, onProbe }: TextureProbeProps) {
	const result = useTexture(() => urls, options);
	useEffect(() => onProbe(result), [onProbe, result]);
	return null;
}

defineTextureHookContract({
	framework: 'react',
	waitFor,
	mount(urls: string[], options: TextureLoadOptions = {}): MountedTextureHook {
		let result: UseTextureResult | undefined;
		const onProbe = (value: UseTextureResult): void => {
			result = value;
		};
		const renderProbe = (nextUrls: string[]) => (
			<TextureProbe urls={nextUrls} options={options} onProbe={onProbe} />
		);
		const view = render(renderProbe(urls));

		return {
			getResult: () => result,
			rerender: async (nextUrls) => {
				view.rerender(renderProbe(nextUrls));
			},
			unmount: view.unmount
		};
	}
});

it('reloads after StrictMode replays effect cleanup and setup', async () => {
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
		vi.fn(async () => ({ width: 24, height: 24, close: vi.fn() }))
	);

	const onProbe = vi.fn();
	const view = render(
		<StrictMode>
			<TextureProbe urls={['/assets/strict-mode.png']} options={{}} onProbe={onProbe} />
		</StrictMode>
	);

	try {
		await waitFor(() => {
			const result = onProbe.mock.lastCall?.[0];
			expect(result?.loading.current).toBe(false);
			expect(result?.textures.current).toHaveLength(1);
		});
	} finally {
		view.unmount();
		vi.unstubAllGlobals();
	}
});
