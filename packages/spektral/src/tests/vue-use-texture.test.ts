import { render, waitFor } from '@testing-library/vue';
import { defineComponent, onMounted, type PropType } from 'vue';
import type { TextureLoadOptions } from '../lib/core/texture-loader.js';
import { useTexture, type UseTextureResult } from '../lib/vue/use-texture.js';
import {
	defineTextureHookContract,
	type MountedTextureHook
} from './helpers/texture-hook-contract.js';

const TextureProbe = defineComponent({
	name: 'VueTextureProbe',
	props: {
		urls: { type: Array as PropType<string[]>, required: true },
		onProbe: {
			type: Function as PropType<(value: UseTextureResult) => void>,
			required: true
		},
		options: { type: Object as PropType<TextureLoadOptions>, required: true }
	},
	setup(props) {
		const result = useTexture(() => props.urls, props.options);
		onMounted(() => props.onProbe(result));
		return () => null;
	}
});

defineTextureHookContract({
	framework: 'vue',
	waitFor,
	mount(urls: string[], options: TextureLoadOptions = {}): MountedTextureHook {
		let result: UseTextureResult | undefined;
		const onProbe = (value: UseTextureResult): void => {
			result = value;
		};
		const view = render(TextureProbe, { props: { urls, options, onProbe } });

		return {
			getResult: () => result,
			rerender: (nextUrls) => view.rerender({ urls: nextUrls, options, onProbe }),
			unmount: view.unmount
		};
	}
});
