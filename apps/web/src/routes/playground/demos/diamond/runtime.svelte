<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame, useMotionGPU } from '@motion-core/motion-gpu';

	const context = useMotionGPU();

	const MAX_YAW = 0.8;
	const MAX_PITCH = 0.8;
	const SMOOTHING = 0.12;

	let targetYaw = 0;
	let targetPitch = 0;
	let yaw = 0;
	let pitch = 0;

	onMount(() => {
		const canvas = context.canvas;
		if (!canvas) {
			return;
		}

		const handlePointerMove = (event: PointerEvent): void => {
			const rect = canvas.getBoundingClientRect();
			const x = (event.clientX - rect.left) / rect.width;
			const y = (event.clientY - rect.top) / rect.height;

			const nx = x * 2.0 - 1.0;
			const ny = y * 2.0 - 1.0;

			targetYaw = nx * MAX_YAW;
			targetPitch = -ny * MAX_PITCH;
		};

		const handlePointerLeave = (): void => {
			targetYaw = 0;
			targetPitch = 0;
		};

		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerleave', handlePointerLeave);

		return () => {
			canvas.removeEventListener('pointermove', handlePointerMove);
			canvas.removeEventListener('pointerleave', handlePointerLeave);
		};
	});

	useFrame((state) => {
		yaw += (targetYaw - yaw) * SMOOTHING;
		pitch += (targetPitch - pitch) * SMOOTHING;
		state.setUniform('uMouse', [yaw, pitch]);
	});
</script>
