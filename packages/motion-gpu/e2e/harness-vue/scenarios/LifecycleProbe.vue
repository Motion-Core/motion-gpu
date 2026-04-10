<script setup lang="ts">
import { onMounted } from 'vue';
import { useFrame, useMotionGPU } from '../../../src/lib/vue';
import type { RenderMode } from '../../../src/lib/core/types';

interface LifecycleProbeControls {
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

const props = defineProps<Props>();
const context = useMotionGPU();
let frameCount = 0;

const { start, stop } = useFrame(
	() => {
		frameCount += 1;
		props.onFrame(frameCount);
	},
	{ autoInvalidate: false }
);

onMounted(() => {
	props.onReady({
		setRenderMode: (mode) => context.renderMode.set(mode),
		invalidate: context.invalidate,
		advance: context.advance,
		startFrameCallback: start,
		stopFrameCallback: stop
	});
});
</script>

<template></template>
