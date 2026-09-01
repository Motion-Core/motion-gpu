<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setSpektralUserContext,
		useSpektralUserContext
	} from '../../lib/svelte/use-spektral-user-context';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const allStore = useSpektralUserContext<Record<string | symbol, unknown>>();
	const pluginStore = useSpektralUserContext<{ plugin: unknown }>('plugin');

	onMount(() => {
		const allEvents: Array<Record<string | symbol, unknown>> = [];
		const pluginEvents: unknown[] = [];

		const unsubscribeAll = allStore.subscribe((value) => {
			allEvents.push(value);
		});
		const unsubscribePlugin = pluginStore.subscribe((value) => {
			pluginEvents.push(value);
		});

		setSpektralUserContext('plugin', () => ({ mode: 'first' }), {
			existing: 'replace'
		});
		setSpektralUserContext('plugin', () => ({ enabled: true }), {
			existing: 'merge'
		});
		setSpektralUserContext<unknown>('plugin', () => 7, {
			existing: 'replace'
		});
		const mergedFallback = setSpektralUserContext('plugin', () => ({ mode: 'fallback' }), {
			existing: 'merge'
		});

		const beforeUnsubscribeCounts = {
			all: allEvents.length,
			plugin: pluginEvents.length
		};

		unsubscribeAll();
		unsubscribePlugin();

		setSpektralUserContext('plugin', () => ({ mode: 'after-unsubscribe' }), {
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
