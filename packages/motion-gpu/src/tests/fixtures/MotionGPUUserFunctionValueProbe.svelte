<script lang="ts">
	import { onMount } from 'svelte';
	import {
		setMotionGPUUserContext,
		useMotionGPUUserContext
	} from '../../lib/svelte/use-motiongpu-user-context';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const pluginStore = useMotionGPUUserContext<(() => string) | undefined>('plugin');
	let invocationCount = 0;
	const storedFunction = (): string => {
		invocationCount += 1;
		return 'svelte-function';
	};

	const returned = setMotionGPUUserContext<() => string>('plugin', storedFunction, {
		existing: 'replace',
		functionValue: 'value'
	});
	const lazyValue = setMotionGPUUserContext('lazy', () => ({ mode: 'lazy' }), {
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
