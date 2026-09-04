<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame, usePointer } from 'spektral/svelte';
	import { RESONANCE_MEDIUM_SIZE, paintResonanceMedium } from './resonance-medium';

	const pointer = usePointer({ requestFrame: 'auto' });
	let mediumCanvas: HTMLCanvasElement | null = null;
	let smoothPointer: [number, number] = [0.5, 0.5];
	let previousPointer: [number, number] = [0.5, 0.5];
	let pointerEnergy = 0;
	let wasInside = false;

	onMount(() => {
		mediumCanvas = document.createElement('canvas');
		mediumCanvas.width = RESONANCE_MEDIUM_SIZE;
		mediumCanvas.height = RESONANCE_MEDIUM_SIZE;
		const context = mediumCanvas.getContext('2d');
		if (context) paintResonanceMedium(context);

		return () => {
			mediumCanvas = null;
		};
	});

	useFrame((frame) => {
		if (!mediumCanvas) return;
		const current = pointer.state.current;
		if (current.inside && !wasInside) {
			smoothPointer = [current.uv[0], current.uv[1]];
			previousPointer = [current.uv[0], current.uv[1]];
		}
		const strokeStart: [number, number] = [smoothPointer[0], smoothPointer[1]];
		const target: [number, number] = current.inside ? current.uv : smoothPointer;
		const positionBlend = 1 - Math.exp(-frame.delta * 16);
		smoothPointer = [
			smoothPointer[0] + (target[0] - smoothPointer[0]) * positionBlend,
			smoothPointer[1] + (target[1] - smoothPointer[1]) * positionBlend
		];
		const movement =
			current.inside && wasInside
				? Math.hypot(current.uv[0] - previousPointer[0], current.uv[1] - previousPointer[1]) /
					Math.max(frame.delta, 1 / 240)
				: 0;
		const targetEnergy = current.inside
			? Math.min(1, movement * 0.2 + (current.pressed || current.dragging ? 0.42 : 0))
			: 0;
		const energyBlend = 1 - Math.exp(-frame.delta * (targetEnergy > pointerEnergy ? 14 : 7));
		pointerEnergy += (targetEnergy - pointerEnergy) * energyBlend;
		if (current.inside) previousPointer = [current.uv[0], current.uv[1]];
		wasInside = current.inside;
		frame.setUniform('uPointer', [
			smoothPointer[0],
			smoothPointer[1],
			strokeStart[0],
			strokeStart[1]
		]);
		frame.setUniform('uPointerEnergy', pointerEnergy);

		frame.setTexture('medium', {
			source: mediumCanvas,
			update: 'once',
			flipY: false,
			colorSpace: 'linear'
		});
	});
</script>
