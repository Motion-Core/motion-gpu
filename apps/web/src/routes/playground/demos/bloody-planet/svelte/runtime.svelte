<script lang="ts">
	import { useFrame, useMotionGPU, usePointer } from '@motion-core/motion-gpu/svelte';

	const MAX_WAVES = 6;
	const REFERENCE_VIEWPORT = 900;
	const MIN_VIEWPORT_SCALE = 0.7;
	const MAX_VIEWPORT_SCALE = 1.18;
	type WaveState = [number, number, number, number];

	const motiongpu = useMotionGPU();
	const waves: WaveState[] = Array.from({ length: MAX_WAVES }, () => [0, 0, 1, -100]);

	let nextWaveIndex = 0;
	let frameTime = 0;

	const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

	const getViewportScale = (): number => {
		const canvas = motiongpu.canvas;
		if (canvas) {
			const shortEdge = Math.max(320, Math.min(canvas.clientWidth, canvas.clientHeight));
			return clamp(shortEdge / REFERENCE_VIEWPORT, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
		}

		const { width, height } = motiongpu.size.current;
		if (width <= 0 || height <= 0) {
			return 1;
		}

		const shortEdge = Math.max(320, Math.min(width, height));
		return clamp(shortEdge / REFERENCE_VIEWPORT, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
	};

	const getRayScale = () => 3 / Math.max(getViewportScale(), 0.0001);

	const toRotatedObjectSpace = (
		point: [number, number, number],
		time: number
	): [number, number, number] => {
		const angle = time * 0.2;
		const s = Math.sin(angle);
		const c = Math.cos(angle);
		const [x, y, z] = point;
		return [-s * x + c * z, y, c * x + s * z];
	};

	const intersectPlanetFromUv = (uv: [number, number]): [number, number, number] | null => {
		const { width, height } = motiongpu.size.current;
		if (width <= 0 || height <= 0) {
			return null;
		}

		const aspect = width / height;
		const rayScale = getRayScale();
		const sx = rayScale * (uv[0] - 0.5) * aspect;
		const sy = rayScale * (uv[1] - 0.5);
		const radial2 = sx * sx + sy * sy;
		if (radial2 >= 1) {
			return null;
		}

		const sz = Math.sqrt(1 - radial2);
		return [sx, sy, sz];
	};

	usePointer({
		onClick: (click) => {
			const worldPoint = intersectPlanetFromUv(click.uv);
			if (!worldPoint) {
				return;
			}

			const point = toRotatedObjectSpace(worldPoint, frameTime);
			const len = Math.hypot(point[0], point[1], point[2]);
			if (len <= 1e-6) {
				return;
			}

			waves[nextWaveIndex] = [point[0] / len, point[1] / len, point[2] / len, frameTime];
			nextWaveIndex = (nextWaveIndex + 1) % MAX_WAVES;
		}
	});

	useFrame((state) => {
		frameTime = state.time;
		state.setUniform('uViewportScale', getViewportScale());
		for (let i = 0; i < MAX_WAVES; i++) {
			state.setUniform(`uClick${i}`, waves[i] as [number, number, number, number]);
		}
	});
</script>
