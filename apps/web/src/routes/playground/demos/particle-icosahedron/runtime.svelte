<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame, useMotionGPU } from '@motion-core/motion-gpu/svelte';

	const context = useMotionGPU();

	let targetRotateY = 0;
	let targetRotateX = 0;
	let smoothRotateY = 0;
	let smoothRotateX = 0;
	let autoRotateY = 0;

	let isDragging = false;
	let lastPointerX = 0;
	let lastPointerY = 0;

	onMount(() => {
		const canvas = context.canvas;
		if (!canvas) return;

		canvas.style.cursor = 'grab';

		const handlePointerDown = (event: PointerEvent): void => {
			isDragging = true;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			canvas.style.cursor = 'grabbing';
		};

		const handlePointerMove = (event: PointerEvent): void => {
			if (!isDragging) return;
			targetRotateY += (event.clientX - lastPointerX) * -0.005;
			targetRotateX += (event.clientY - lastPointerY) * 0.005;
			targetRotateX = Math.max(-1.1, Math.min(1.1, targetRotateX));
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
		};

		const handlePointerUp = (): void => {
			isDragging = false;
			canvas.style.cursor = 'grab';
		};

		canvas.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointerleave', handlePointerUp);

		return () => {
			canvas.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointerleave', handlePointerUp);
		};
	});

	useFrame((state) => {
		autoRotateY += state.delta * 0.24;

		smoothRotateY += (targetRotateY - smoothRotateY) * 0.14;
		smoothRotateX += (targetRotateX - smoothRotateX) * 0.14;

		state.setUniform('uRotateY', autoRotateY + smoothRotateY);
		state.setUniform('uRotateX', smoothRotateX);
	});
</script>
