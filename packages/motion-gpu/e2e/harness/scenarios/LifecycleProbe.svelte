<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame } from '../../../src/lib/svelte/frame-context';
	import { useMotionGPU } from '../../../src/lib/svelte/motiongpu-context';
	import type { RenderMode } from '../../../src/lib/core/types';

	export interface LifecycleProbeControls {
		setRenderMode: (mode: RenderMode) => void;
		invalidate: () => void;
		advance: () => void;
		startFrameCallback: () => void;
		stopFrameCallback: () => void;
	}

	interface Props {
		onFrame: (count: number) => void;
		onReady: (controls: LifecycleProbeControls) => void;
	}

	let { onFrame, onReady }: Props = $props();
	const context = useMotionGPU();
	let frameCount = 0;

	const { start, stop } = useFrame(
		() => {
			frameCount += 1;
			onFrame(frameCount);
		},
		{ autoInvalidate: false }
	);

	onMount(() => {
		onReady({
			setRenderMode: (mode) => context.renderMode.set(mode),
			invalidate: context.invalidate,
			advance: context.advance,
			startFrameCallback: start,
			stopFrameCallback: stop
		});
	});
</script>
