<script lang="ts">
	import { useTexture, type UseTextureResult } from '../../lib/svelte/use-texture';
	import type { TextureLoadOptions } from '../../lib/core/texture-loader';

	interface Props {
		urls: string[];
		onProbe: (result: UseTextureResult) => void;
		options?: TextureLoadOptions;
	}

	let { urls, onProbe, options = {} }: Props = $props();
	const result = useTexture(() => urls, () => options);

	$effect(() => {
		onProbe(result);
	});
</script>
