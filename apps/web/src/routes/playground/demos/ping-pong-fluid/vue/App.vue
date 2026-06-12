<script setup lang="ts">
import { FragCanvas, PingPongShaderPass, defineMaterial } from '@motion-core/motion-gpu/vue';
import Runtime from './runtime.vue';
import fluidShader from './shaders/fluid.wgsl?raw';
import fragmentShader from './shaders/fragment.wgsl?raw';

const SIM_SIZE = 512;

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
	width: SIM_SIZE,
	height: SIM_SIZE,
	format: 'rgba16float',
	filter: 'linear',
	iterations: 4
});
</script>

<template>
	<FragCanvas
		:material="material"
		:passes="[simulateFluid]"
		:color="{ outputEncoding: 'srgb', dynamicRange: 'sdr', canvasColorSpace: 'srgb' }"
	>
		<Runtime />
	</FragCanvas>
</template>
