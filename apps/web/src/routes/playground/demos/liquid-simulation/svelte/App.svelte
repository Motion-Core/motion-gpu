<script lang="ts">
	/*
	 * Created by Marek Jóźwiak @madebyhex
	 *
	 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
	 * SPDX-License-Identifier: CC-BY-NC-SA-4.0
	 *
	 * You are free to share and adapt this work under the terms of the license.
	 * https://creativecommons.org/licenses/by-nc-sa/4.0/
	 */
	import {
		ComputePass,
		FragCanvas,
		PingPongComputePass,
		defineMaterial
	} from '@motion-core/motion-gpu/svelte';
	import Runtime from './runtime.svelte';
	import fragmentShader from './shaders/fragment.wgsl?raw';
	import simulateShader from './shaders/simulate.wgsl?raw';
	import visualizeShader from './shaders/visualize.wgsl?raw';

	const SIZE = 512;
	const material = defineMaterial({
		fragment: fragmentShader,
		textures: {
			waveState: {
				storage: true,
				format: 'rgba16float',
				width: SIZE,
				height: SIZE,
				filter: 'linear',
				fragmentVisible: false
			},
			medium: {
				format: 'rgba8unorm',
				colorSpace: 'linear',
				filter: 'linear',
				update: 'once',
				fragmentVisible: false,
				flipY: false
			},
			finalOutput: {
				storage: true,
				format: 'rgba16float',
				width: SIZE,
				height: SIZE,
				filter: 'linear'
			}
		},
		uniforms: { uPointer: [0.5, 0.5, 0.5, 0.5], uPointerEnergy: 0 }
	});

	const simulate = new PingPongComputePass({
		compute: simulateShader,
		resources: {
			uWavePrevious: {
				texture: 'waveState',
				access: 'sampled',
				pingPong: 'read'
			},
			uWaveNext: {
				texture: 'waveState',
				access: 'storage-write',
				pingPong: 'write'
			},
			uMedium: { texture: 'medium', access: 'sampled' },
			uMediumSampler: { sampler: 'medium' }
		},
		iterations: 6,
		dispatch: [SIZE / 8, SIZE / 8]
	});

	const visualize = new ComputePass({
		compute: visualizeShader,
		resources: {
			uWave: { texture: 'waveState', access: 'sampled' },
			uFinal: { texture: 'finalOutput', access: 'storage-write' }
		},
		dispatch: [SIZE / 8, SIZE / 8]
	});
</script>

<FragCanvas {material} passes={[visualize, simulate]}>
	<Runtime />
</FragCanvas>
