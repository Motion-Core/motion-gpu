<script setup lang="ts">
import { onMounted } from 'vue';
import { useFrame, useMotionGPU } from '../../../src/lib/vue';
import type { FrameState, RenderMode, UniformValue } from '../../../src/lib/core/types';

interface UniformProbeControls {
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

const props = defineProps<Props>();
const context = useMotionGPU();
let frameCount = 0;

useFrame(
	(state: FrameState) => {
		frameCount += 1;
		props.onFrame(frameCount);
		if (props.uniformName !== null) {
			state.setUniform(props.uniformName, props.uniformValue);
		}
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
