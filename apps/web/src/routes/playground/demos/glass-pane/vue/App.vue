<script setup lang="ts">
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/vue';
import Runtime from './runtime.vue';
import fragmentShader from './shaders/fragment.wgsl?raw';

const material = defineMaterial({
	defines: {
		GLASS_ROTATION: 50.0,
		GLASS_REFRACTION: 1.0,
		GLASS_CHROMATIC_ABERRATION: 1.0,
		GLASS_PANEL_WIDTH: 0.5,
		GLASS_WAVE_FREQUENCY: 0.6,
		GLASS_WAVE_AMPLITUDE: 0.6,
		GLASS_SPEED: 0.5
	},
	fragment: fragmentShader,
	textures: {
		uImage: {
			flipY: true,
			colorSpace: 'srgb',
			generateMipmaps: false
		}
	}
});
</script>

<template>
	<FragCanvas
		:material="material"
		:color="{ outputEncoding: 'srgb', dynamicRange: 'sdr', canvasColorSpace: 'srgb' }"
	>
		<Runtime />
	</FragCanvas>
</template>
