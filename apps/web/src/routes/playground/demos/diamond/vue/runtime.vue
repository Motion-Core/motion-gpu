<script setup lang="ts">
import { useFrame, usePointer } from '@motion-core/motion-gpu/vue';

	const MAX_YAW = 0.8;
	const MAX_PITCH = 0.8;
	const SMOOTHING = 0.12;

	let targetYaw = 0;
	let targetPitch = 0;
	let yaw = 0;
	let pitch = 0;

	const pointer = usePointer({
		onMove: (state) => {
			if (!state.inside) {
				return;
			}
			targetYaw = state.ndc[0] * MAX_YAW;
			targetPitch = state.ndc[1] * MAX_PITCH;
		}
	});

	useFrame((state) => {
		const pointerState = pointer.state.current;
		if (!pointerState.inside && !pointerState.pressed) {
			targetYaw = 0;
			targetPitch = 0;
		}
		yaw += (targetYaw - yaw) * SMOOTHING;
		pitch += (targetPitch - pitch) * SMOOTHING;
		state.setUniform('uMouse', [yaw, pitch]);
	});
</script>
