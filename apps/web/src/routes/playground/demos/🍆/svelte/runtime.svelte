<script lang="ts">
	import { useFrame, usePointer } from '@motion-core/motion-gpu/svelte';

	const MAX_ORBIT_X = 0.78;
	const MAX_ORBIT_Y = 0.72;
	const MAX_OFFSET_X = 0.2;
	const MAX_OFFSET_Y = 0.14;

	const POS_STIFFNESS_ACTIVE = 34.0;
	const POS_DAMPING_ACTIVE = 8.5;
	const POS_STIFFNESS_IDLE = 16.0;
	const POS_DAMPING_IDLE = 7.5;
	const ROT_STIFFNESS_ACTIVE = 22.0;
	const ROT_DAMPING_ACTIVE = 7.8;
	const ROT_STIFFNESS_IDLE = 14.0;
	const ROT_DAMPING_IDLE = 7.0;
	const INPUT_RESPONSE_ACTIVE = 20.0;
	const INPUT_RESPONSE_IDLE = 10.0;
	const JELLY_RESPONSE = 8.0;
	const JELLY_DIR_RESPONSE = 12.0;

	let rawOrbitX = 0;
	let rawOrbitY = 0;
	let rawOffsetX = 0;
	let rawOffsetY = 0;
	let targetOrbitX = 0;
	let targetOrbitY = 0;
	let targetOffsetX = 0;
	let targetOffsetY = 0;

	let orbitX = 0;
	let orbitY = 0;
	let orbitVX = 0;
	let orbitVY = 0;
	let offsetX = 0;
	let offsetY = 0;
	let offsetVX = 0;
	let offsetVY = 0;
	let jellyAmp = 0;
	let jellyDirX = 1;
	let jellyDirY = 0;
	let jellyDirTargetX = 1;
	let jellyDirTargetY = 0;

	function springStep(
		value: number,
		velocity: number,
		target: number,
		stiffness: number,
		damping: number,
		dt: number
	): [number, number] {
		const force = (target - value) * stiffness;
		velocity += force * dt;
		velocity *= Math.exp(-damping * dt);
		value += velocity * dt;
		return [value, velocity];
	}

	const pointer = usePointer({
		onMove: (state) => {
			if (!state.inside) {
				return;
			}
			rawOrbitX = -state.ndc[0] * MAX_ORBIT_X;
			rawOrbitY = state.ndc[1] * MAX_ORBIT_Y;
			rawOffsetX = state.ndc[0] * MAX_OFFSET_X;
			rawOffsetY = state.ndc[1] * MAX_OFFSET_Y;
		}
	});

	useFrame((frame) => {
		const dt = Math.min(frame.delta, 1 / 30);
		const pointerState = pointer.state.current;
		const active = pointerState.inside || pointerState.pressed;
		if (!active) {
			rawOrbitX = 0;
			rawOrbitY = 0;
			rawOffsetX = 0;
			rawOffsetY = 0;
		}
		const inputResponse = active ? INPUT_RESPONSE_ACTIVE : INPUT_RESPONSE_IDLE;
		const inputSmoothing = 1.0 - Math.exp(-inputResponse * dt);
		targetOrbitX += (rawOrbitX - targetOrbitX) * inputSmoothing;
		targetOrbitY += (rawOrbitY - targetOrbitY) * inputSmoothing;
		targetOffsetX += (rawOffsetX - targetOffsetX) * inputSmoothing;
		targetOffsetY += (rawOffsetY - targetOffsetY) * inputSmoothing;

		const posStiffness = active ? POS_STIFFNESS_ACTIVE : POS_STIFFNESS_IDLE;
		const posDamping = active ? POS_DAMPING_ACTIVE : POS_DAMPING_IDLE;
		const rotStiffness = active ? ROT_STIFFNESS_ACTIVE : ROT_STIFFNESS_IDLE;
		const rotDamping = active ? ROT_DAMPING_ACTIVE : ROT_DAMPING_IDLE;

		[offsetX, offsetVX] = springStep(offsetX, offsetVX, targetOffsetX, posStiffness, posDamping, dt);
		[offsetY, offsetVY] = springStep(offsetY, offsetVY, targetOffsetY, posStiffness, posDamping, dt);
		[orbitX, orbitVX] = springStep(orbitX, orbitVX, targetOrbitX, rotStiffness, rotDamping, dt);
		[orbitY, orbitVY] = springStep(orbitY, orbitVY, targetOrbitY, rotStiffness, rotDamping, dt);

		const impulseX = offsetVX * 1.2 + orbitVX * 0.18;
		const impulseY = offsetVY * 1.2 + orbitVY * 0.18;
		const impulseMag = Math.hypot(impulseX, impulseY);
		if (impulseMag > 1e-4) {
			jellyDirTargetX = impulseX / impulseMag;
			jellyDirTargetY = impulseY / impulseMag;
		}
		const dirSmoothing = 1.0 - Math.exp(-JELLY_DIR_RESPONSE * dt);
		const blendedDirX = jellyDirX + (jellyDirTargetX - jellyDirX) * dirSmoothing;
		const blendedDirY = jellyDirY + (jellyDirTargetY - jellyDirY) * dirSmoothing;
		const blendedDirMag = Math.hypot(blendedDirX, blendedDirY);
		if (blendedDirMag > 1e-4) {
			jellyDirX = blendedDirX / blendedDirMag;
			jellyDirY = blendedDirY / blendedDirMag;
		}

		const stretchError = Math.hypot(targetOffsetX - offsetX, targetOffsetY - offsetY);
		const ampTarget = Math.min(0.42, impulseMag * 1.9 + stretchError * 2.0);
		const ampSmoothing = 1.0 - Math.exp(-JELLY_RESPONSE * dt);
		jellyAmp += (ampTarget - jellyAmp) * ampSmoothing;

		frame.setUniform('uRotateY', orbitX);
		frame.setUniform('uRotateX', orbitY);
		frame.setUniform('uTranslateX', offsetX);
		frame.setUniform('uTranslateY', offsetY);
		frame.setUniform('uJellyAmp', jellyAmp);
		frame.setUniform('uJellyTime', frame.time);
		frame.setUniform('uJellyDirX', jellyDirX);
		frame.setUniform('uJellyDirY', jellyDirY);
	});
</script>
