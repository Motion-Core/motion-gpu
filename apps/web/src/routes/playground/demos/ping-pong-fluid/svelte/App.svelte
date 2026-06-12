<script lang="ts">
	import { FragCanvas, PingPongShaderPass, defineMaterial } from '@motion-core/motion-gpu/svelte';
	import Runtime from './runtime.svelte';
	import fluidShader from './shaders/fluid.wgsl?raw';
	import fragmentShader from './shaders/fragment.wgsl?raw';

	let offsetWidth = $state<number>();
	let offsetHeight = $state<number>();

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

	function constrainResolution(w: number, h: number, max: number): [number, number] {
		const longest = Math.max(w, h);
		if (longest <= max) return [w, h];
		const ratio = max / longest;
		return [Math.round(w * ratio), Math.round(h * ratio)];
	}

	$effect(() => {
		if (!offsetWidth || !offsetHeight) return;
		const [w, h] = constrainResolution(offsetWidth, offsetHeight, 512);
		simulateFluid.setDimensions(w, h);
	});
</script>

<div style="width: 100%; height: 100%;" bind:offsetWidth bind:offsetHeight>
	<FragCanvas
		{material}
		passes={[simulateFluid]}
		color={{ outputEncoding: 'srgb', dynamicRange: 'sdr', canvasColorSpace: 'srgb' }}
	>
		<Runtime />
	</FragCanvas>
</div>
