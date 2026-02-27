<script lang="ts">
	import { useTexture, type UseTextureResult } from '../../lib/use-texture';

	interface Props {
		urls: string[];
		onProbe: (result: UseTextureResult) => void;
	}

	let { urls, onProbe }: Props = $props();

	const result = useTexture(() => urls);

	$effect(() => {
		onProbe(result);
	});
</script>
