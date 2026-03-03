<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame } from '../../src/lib/frame-context';
	import { useMotionGPU } from '../../src/lib/motiongpu-context';
	import type { RenderMode } from '../../src/lib/core/types';

	export interface RuntimeControls {
		setRenderMode: (mode: RenderMode) => void;
		invalidate: () => void;
		advance: () => void;
	}

	interface Props {
		onFrame: (count: number) => void;
		onReady: (controls: RuntimeControls) => void;
	}

	let { onFrame, onReady }: Props = $props();
	const context = useMotionGPU();
	let frameCount = 0;

	useFrame(
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
			advance: context.advance
		});
	});
</script>
