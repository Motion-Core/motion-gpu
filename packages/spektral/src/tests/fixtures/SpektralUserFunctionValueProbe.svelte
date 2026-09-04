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

	const pluginStore = useSpektralUserContext<{ plugin: () => string }>('plugin');
	let invocationCount = 0;
	const storedFunction = (): string => {
		invocationCount += 1;
		return 'svelte-function';
	};

	const returned = setSpektralUserContext<() => string>('plugin', storedFunction, {
		existing: 'replace',
		functionValue: 'value'
	});
	const lazyValue = setSpektralUserContext('lazy', () => ({ mode: 'lazy' }), {
		existing: 'replace'
	});
	const callsAfterSet = invocationCount;
	const currentFunction = pluginStore.current;
	const sameReference = returned === storedFunction && currentFunction === storedFunction;
	const invokedValue = currentFunction?.() ?? null;
	const callsAfterInvoke = invocationCount;

	onMount(() => {
		onProbe({
			sameReference,
			callsAfterSet,
			invokedValue,
			callsAfterInvoke,
			lazyValue
		});
	});
</script>
