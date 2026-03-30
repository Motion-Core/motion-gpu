<script lang="ts">
	import { useFrame } from '../../../src/lib/svelte/frame-context';
	import { useMotionGPU } from '../../../src/lib/svelte/motiongpu-context';
	import type { RenderMode, UniformValue } from '../../../src/lib/core/types';

	export interface UniformProbeControls {
		setRenderMode: (mode: RenderMode) => void;
		invalidate: () => void;
		advance: () => void;
	}

	interface Props {
		onFrame: (count: number) => void;
		onReady: (controls: UniformProbeControls) => void;
		uniformName: string | null;
		uniformValue: UniformValue;
	}

	import { onMount } from 'svelte';

	let { onFrame, onReady, uniformName, uniformValue }: Props = $props();
	const context = useMotionGPU();
	let frameCount = 0;

	useFrame(
		(state) => {
			frameCount += 1;
			onFrame(frameCount);
			if (uniformName !== null) {
				state.setUniform(uniformName, uniformValue);
			}
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
