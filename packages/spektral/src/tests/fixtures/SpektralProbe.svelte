<script lang="ts">
	import { onMount } from 'svelte';
	import { useSpektral } from '../../lib/svelte/spektral-context';

	interface Props {
		onProbe: (value: ReturnType<typeof useSpektral>) => void;
	}

	let { onProbe }: Props = $props();
	const context = useSpektral();

	onMount(() => {
		onProbe(context);
	});
</script>
