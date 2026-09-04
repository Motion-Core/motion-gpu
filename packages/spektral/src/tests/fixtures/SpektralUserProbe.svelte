<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setSpektralUserContext,
		useSpektralUserContext
	} from '../../lib/svelte/use-spektral-user-context';
	import { runUserContextSemantics } from '../helpers/user-context-contract';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const allStore = useSpektralUserContext();
	const pluginStore = useSpektralUserContext<Record<string, Record<string, unknown>>>('plugin');
	const result = runUserContextSemantics(allStore, pluginStore, setSpektralUserContext);

	onMount(() => {
		onProbe(result);
	});
</script>
