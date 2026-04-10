<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
	import { useFrame, useMotionGPU, usePointer } from '@motion-core/motion-gpu/vue';

	const context = useMotionGPU();

	let targetRotateY = 0;
	let targetRotateX = 0;
	let smoothRotateY = 0;
	let smoothRotateX = 0;
	let autoRotateY = 0;

	const pointer = usePointer({
		onDown: () => {
			const canvas = context.canvas;
			if (canvas) {
				canvas.style.cursor = 'grabbing';
			}
		},
		onUp: () => {
			const canvas = context.canvas;
			if (canvas) {
				canvas.style.cursor = 'grab';
			}
		}
	});

	onMounted(() => {
		const canvas = context.canvas;
		if (!canvas) return;

		canvas.style.cursor = 'grab';
	});

	onUnmounted(() => {
		const canvas = context.canvas;
		if (!canvas) return;
		canvas.style.cursor = '';
	});

	useFrame((state) => {
		const pointerState = pointer.state.current;
		if (pointerState.pressed && pointerState.dragging) {
			targetRotateY += pointerState.deltaPx[0] * -0.005;
			targetRotateX += pointerState.deltaPx[1] * 0.005;
			targetRotateX = Math.max(-1.1, Math.min(1.1, targetRotateX));
		}

		autoRotateY += state.delta * 0.24;

		smoothRotateY += (targetRotateY - smoothRotateY) * 0.14;
		smoothRotateX += (targetRotateX - smoothRotateX) * 0.14;

		state.setUniform('uRotateY', autoRotateY + smoothRotateY);
		state.setUniform('uRotateX', smoothRotateX);
	});
</script>
