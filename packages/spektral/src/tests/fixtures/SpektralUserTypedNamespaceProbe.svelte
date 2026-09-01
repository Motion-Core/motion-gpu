<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setSpektralUserContext,
		useSpektralUserContext
	} from '../../lib/svelte/use-spektral-user-context';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	type UserMap = {
		plugin: {
			enabled: boolean;
		};
	};

	let { onProbe }: Props = $props();
	const pluginStore = useSpektralUserContext<UserMap>('plugin');
	const assertType = <T>(value: T): void => {
		void value;
	};
	setSpektralUserContext('plugin', () => ({ enabled: true }), {
		existing: 'replace'
	});

	// @ts-expect-error mapped namespace value should not expose unknown fields
	assertType<boolean>(pluginStore.current?.missing);

	onMount(() => {
		onProbe({
			enabled: pluginStore.current?.enabled ?? false
		});
	});
</script>
