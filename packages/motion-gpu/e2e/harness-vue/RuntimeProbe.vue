<script setup lang="ts">
import { onMounted } from 'vue';
import { useFrame, useMotionGPU } from '../../src/lib/vue';
import type { RuntimeControls } from './runtime-controls.js';

interface Props {
	onFrame: (count: number) => void;
	onReady: (controls: RuntimeControls) => void;
}

const props = defineProps<Props>();
const context = useMotionGPU();
let frameCount = 0;

useFrame(
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
		advance: context.advance
	});
});
</script>

<template></template>
