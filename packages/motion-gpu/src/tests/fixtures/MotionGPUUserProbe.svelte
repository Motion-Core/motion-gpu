<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setMotionGPUUserContext,
		useMotionGPUUserContext
	} from '../../lib/svelte/use-motiongpu-user-context';
	import { runUserContextSemantics } from '../helpers/user-context-contract';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const allStore = useMotionGPUUserContext();
	const pluginStore = useMotionGPUUserContext<Record<string, Record<string, unknown>>>('plugin');
	const result = runUserContextSemantics(allStore, pluginStore, setMotionGPUUserContext);

	onMount(() => {
		onProbe(result);
	});
</script>
