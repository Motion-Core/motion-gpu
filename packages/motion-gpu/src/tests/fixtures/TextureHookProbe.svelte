<script lang="ts">
	import { untrack } from 'svelte';
	import { useTexture, type UseTextureResult } from '../../lib/use-texture';
	import type { TextureLoadOptions } from '../../lib/core/texture-loader';

	interface Props {
		urls: string[];
		onProbe: (result: UseTextureResult) => void;
		options?: TextureLoadOptions;
	}

	let { urls, onProbe, options = {} }: Props = $props();
	const textureOptions: TextureLoadOptions = untrack(() => ({ ...options }));

	$effect(() => {
		for (const key of Object.keys(textureOptions) as Array<keyof TextureLoadOptions>) {
			delete textureOptions[key];
		}
		Object.assign(textureOptions, options);
	});

	const result = useTexture(() => urls, textureOptions);

	$effect(() => {
		onProbe(result);
	});
</script>
