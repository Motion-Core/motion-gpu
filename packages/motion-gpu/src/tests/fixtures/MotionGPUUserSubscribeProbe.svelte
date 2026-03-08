<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setMotionGPUUserContext,
		useMotionGPUUserContext
	} from '../../lib/use-motiongpu-user-context';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
	const pluginStore = useMotionGPUUserContext<unknown>('plugin');

	onMount(() => {
		const allEvents: Array<Record<string | symbol, unknown>> = [];
		const pluginEvents: unknown[] = [];

		const unsubscribeAll = allStore.subscribe((value) => {
			allEvents.push(value);
		});
		const unsubscribePlugin = pluginStore.subscribe((value) => {
			pluginEvents.push(value);
		});

		setMotionGPUUserContext('plugin', () => ({ mode: 'first' }), {
			existing: 'replace'
		});
		setMotionGPUUserContext('plugin', () => ({ enabled: true }), {
			existing: 'merge'
		});
		setMotionGPUUserContext<unknown>('plugin', () => 7, {
			existing: 'replace'
		});
		const mergedFallback = setMotionGPUUserContext('plugin', () => ({ mode: 'fallback' }), {
			existing: 'merge'
		});

		const beforeUnsubscribeCounts = {
			all: allEvents.length,
			plugin: pluginEvents.length
		};

		unsubscribeAll();
		unsubscribePlugin();

		setMotionGPUUserContext('plugin', () => ({ mode: 'after-unsubscribe' }), {
			existing: 'replace'
		});

		onProbe({
			allEvents,
			pluginEvents,
			beforeUnsubscribeCounts,
			mergedFallback,
			currentPlugin: pluginStore.current
		});
	});
</script>
