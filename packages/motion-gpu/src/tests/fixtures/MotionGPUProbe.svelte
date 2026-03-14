<script lang="ts">
	import { onMount } from 'svelte';
	import { useMotionGPU } from '../../lib/svelte/motiongpu-context';

	interface Props {
		onProbe: (value: ReturnType<typeof useMotionGPU>) => void;
	}

	let { onProbe }: Props = $props();
	const context = useMotionGPU();

	onMount(() => {
		onProbe(context);
	});
</script>
