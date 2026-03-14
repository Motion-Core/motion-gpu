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

	const allStore = useMotionGPUUserContext();
	const beforeInitial = allStore.current;
	const initial = setMotionGPUUserContext('plugin', () => ({ mode: 'initial', enabled: true }));
	const afterInitial = allStore.current;
	const skipped = setMotionGPUUserContext('plugin', () => ({ mode: 'skipped' }));
	const afterSkipped = allStore.current;
	const merged = setMotionGPUUserContext('plugin', () => ({ merged: true }), { existing: 'merge' });
	const afterMerged = allStore.current;
	const replaced = setMotionGPUUserContext('plugin', () => ({ mode: 'replaced' }), {
		existing: 'replace'
	});
	const afterReplaced = allStore.current;
	const skippedAfterReplace = setMotionGPUUserContext('plugin', () => ({ mode: 'unchanged' }));
	const afterSkippedAfterReplace = allStore.current;
	const pluginStore = useMotionGPUUserContext<Record<string, unknown>>('plugin');

	onMount(() => {
		onProbe({
			initial,
			skipped,
			merged,
			replaced,
			skippedAfterReplace,
			pluginStore,
			allStore,
			contextRefs: {
				beforeInitial,
				afterInitial,
				afterSkipped,
				afterMerged,
				afterReplaced,
				afterSkippedAfterReplace
			}
		});
	});
</script>
