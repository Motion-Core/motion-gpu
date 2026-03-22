<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setMotionGPUUserContext,
		useMotionGPUUserContext
	} from '../../lib/svelte/use-motiongpu-user-context';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	type UserMap = {
		plugin: {
			enabled: boolean;
		};
	};

	let { onProbe }: Props = $props();
	const pluginStore = useMotionGPUUserContext<UserMap>('plugin');
	setMotionGPUUserContext('plugin', () => ({ enabled: true }), {
		existing: 'replace'
	});

	// @ts-expect-error mapped namespace value should not expose unknown fields
	pluginStore.current?.missing;

	onMount(() => {
		onProbe({
			enabled: pluginStore.current?.enabled ?? false
		});
	});
</script>
