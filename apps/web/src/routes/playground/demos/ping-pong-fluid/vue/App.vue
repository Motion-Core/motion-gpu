<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue';
import { FragCanvas, PingPongShaderPass, defineMaterial } from '@motion-core/motion-gpu/vue';
import Runtime from './runtime.vue';
import fluidShader from './shaders/fluid.wgsl?raw';
import fragmentShader from './shaders/fragment.wgsl?raw';

const material = defineMaterial({
	fragment: fragmentShader,
	textures: {
		uImage: {
			flipY: true,
			colorSpace: 'srgb',
			generateMipmaps: false
		},
		fluid: {
			format: 'rgba16float',
			filter: 'linear'
		}
	},
	uniforms: {
		uPointer: [0.5, 0.5, 0.5, 0.5],
		uPointerActive: 0
	},
	defines: {
		DISTORTION_AMOUNT: 2.0
	}
});

const simulateFluid = new PingPongShaderPass({
	fragment: fluidShader,
	target: 'fluid',
	format: 'rgba16float',
	filter: 'linear',
	iterations: 4
});

const wrapRef = ref<HTMLDivElement | null>(null);
const width = ref(0);
const height = ref(0);

function constrainResolution(w: number, h: number, max: number): [number, number] {
	const longest = Math.max(w, h);
	if (longest <= max) return [w, h];
	const ratio = max / longest;
	return [Math.round(w * ratio), Math.round(h * ratio)];
}

onMounted(() => {
	if (!wrapRef.value) return;
	const observer = new ResizeObserver(([entry]) => {
		const { inlineSize, blockSize } = entry.contentBoxSize[0];
		width.value = inlineSize;
		height.value = blockSize;
	});
	observer.observe(wrapRef.value);
});

watchEffect(() => {
	if (!width.value || !height.value) return;
	const [w, h] = constrainResolution(width.value, height.value, 512);
	simulateFluid.setDimensions(w, h);
});
</script>

<template>
	<div ref="wrapRef" style="width: 100%; height: 100%">
		<FragCanvas
			:material="material"
			:passes="[simulateFluid]"
			:color="{ outputEncoding: 'srgb', dynamicRange: 'sdr', canvasColorSpace: 'srgb' }"
		>
			<Runtime />
		</FragCanvas>
	</div>
</template>
