<script lang="ts">
	import { useFrame, usePointer } from '@motion-core/motion-gpu/svelte';

	const GOLDEN_RATIO = 0.618033988;
	const MAX_CLICKS = 8;

	const clicks: [number, number, number, number][] = Array.from(
		{ length: MAX_CLICKS },
		(): [number, number, number, number] => [0, 0, -1, 0]
	);

	let nextIndex = 0;
	let clickCounter = 0;
	let mouseUv: [number, number] = [0.5, 0.5];
	let mouseInside = 0;
	let frameTime = 0;

	usePointer({
		onMove: (state) => {
			mouseUv = [state.uv[0], state.uv[1]];
			mouseInside = state.inside ? 1 : 0;
		},
		onDown: (state) => {
			mouseUv = [state.uv[0], state.uv[1]];
			mouseInside = 1;
		},
		onUp: (state) => {
			mouseUv = [state.uv[0], state.uv[1]];
			mouseInside = state.inside ? 1 : 0;
		},
		onClick: (click) => {
			const hue = (clickCounter * GOLDEN_RATIO) % 1.0;
			clicks[nextIndex] = [click.uv[0], click.uv[1], frameTime, hue];
			nextIndex = (nextIndex + 1) % MAX_CLICKS;
			clickCounter++;
		}
	});

	useFrame((state) => {
		frameTime = state.time;

		state.setUniform('uMouse', mouseUv);
		state.setUniform('uMouseInside', mouseInside);
		state.setUniform('uNextHue', (clickCounter * GOLDEN_RATIO) % 1.0);

		for (let i = 0; i < MAX_CLICKS; i++) {
			state.setUniform(`uClick${i}`, clicks[i]);
		}
	});
</script>
