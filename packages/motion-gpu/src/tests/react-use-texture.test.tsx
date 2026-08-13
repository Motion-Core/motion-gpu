import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
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
