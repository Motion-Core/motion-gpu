<script lang="ts">
	import { onMount } from 'svelte';
	import { useMotionGPUUserContext } from '../../lib/use-motiongpu-user-context';

	interface Props {
		onProbe: (value: unknown) => void;
	}

	let { onProbe }: Props = $props();

	const initial = useMotionGPUUserContext('plugin', () => ({ mode: 'initial', enabled: true }));
	const skipped = useMotionGPUUserContext('plugin', () => ({ mode: 'skipped' }));
	const merged = useMotionGPUUserContext('plugin', () => ({ merged: true }), { existing: 'merge' });
	const replaced = useMotionGPUUserContext('plugin', () => ({ mode: 'replaced' }), {
		existing: 'replace'
	});
	const pluginStore = useMotionGPUUserContext<Record<string, unknown>>('plugin');
	const allStore = useMotionGPUUserContext();

	onMount(() => {
		onProbe({
			initial,
			skipped,
			merged,
			replaced,
			pluginStore,
			allStore
		});
	});
</script>
