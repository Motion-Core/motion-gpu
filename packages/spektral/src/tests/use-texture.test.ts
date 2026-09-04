import { render, waitFor } from '@testing-library/svelte';
import type { TextureLoadOptions } from '../lib/core/texture-loader.js';
import type { UseTextureResult } from '../lib/svelte/use-texture.js';
import TextureHookProbe from './fixtures/TextureHookProbe.svelte';
import {
	defineTextureHookContract,
	type MountedTextureHook
} from './helpers/texture-hook-contract.js';

defineTextureHookContract({
	framework: 'svelte',
	waitFor,
	mount(urls: string[], options: TextureLoadOptions = {}): MountedTextureHook {
		let result: UseTextureResult | undefined;
		const onProbe = (value: UseTextureResult): void => {
			result = value;
		};
		const view = render(TextureHookProbe, { props: { urls, options, onProbe } });

		return {
			getResult: () => result,
			rerender: (nextUrls) => view.rerender({ urls: nextUrls, options, onProbe }),
			unmount: view.unmount
		};
	}
});
