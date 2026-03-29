<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame, useMotionGPU } from '@motion-core/motion-gpu/svelte';

	type Axis = 'x' | 'y' | 'z';
	type Layer = -1 | 0 | 1;
	type Direction = -1 | 1;
	type Vec3 = [number, number, number];
	type Quat = [number, number, number, number];

	type Move = {
		axis: Axis;
		layer: Layer;
		direction: Direction;
	};

	type Cubelet = {
		position: Vec3;
		quaternion: Quat;
	};

	const motion = useMotionGPU();

	const CUBE_COUNT = 27;
	const ENTRY_STRIDE = 4;
	const MOVE_DURATION = 1.15;
	const MOVE_DELAY = 0.35;
	const HALF_PI = Math.PI * 0.5;

	const DRAG_SENSITIVITY = 0.005;
	const DRAG_VELOCITY_SMOOTHING = 0.2;
	const MOMENTUM_DECAY = 3.25;
	const MOMENTUM_MIN_SPEED = 0.015;
	const AUTO_ROTATE_SPEED = 0.24;
	const BASE_CUBE_SCALE = 0.9;
	const BASE_CUBE_GAP = 0.05;
	const BASE_ROUND_RADIUS = 0.075;
	const REFERENCE_VIEWPORT = 900;

	const AXIS_VECTORS: Record<Axis, Vec3> = {
		x: [1, 0, 0],
		y: [0, 1, 0],
		z: [0, 0, 1]
	};

	const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = {
		x: 0,
		y: 1,
		z: 2
	};

	const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

	const POSSIBLE_MOVES: Move[] = (() => {
		const moves: Move[] = [];
		for (const axis of ['x', 'y', 'z'] as const) {
			for (const layer of [-1, 0, 1] as const) {
				for (const direction of [-1, 1] as const) {
					moves.push({ axis, layer, direction });
				}
			}
		}
		return moves;
	})();

	const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

	const initializeCubelets = (): Cubelet[] => {
		const cubelets: Cubelet[] = [];
		for (const x of [-1, 0, 1] as const) {
			for (const y of [-1, 0, 1] as const) {
				for (const z of [-1, 0, 1] as const) {
					cubelets.push({
						position: [x, y, z],
						quaternion: [0, 0, 0, 1]
					});
				}
			}
		}
		return cubelets;
	};

	const quatNormalize = (q: Quat): Quat => {
		const magnitude = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
		return [q[0] / magnitude, q[1] / magnitude, q[2] / magnitude, q[3] / magnitude];
	};

	const quatMultiply = (a: Quat, b: Quat): Quat =>
		quatNormalize([
			a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
			a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
			a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
			a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
		]);

	const quatConjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

	const quatFromAxisAngle = (axis: Vec3, angle: number): Quat => {
		const half = angle * 0.5;
		const s = Math.sin(half);
		return quatNormalize([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]);
	};

	const quatRotateVec = (q: Quat, v: Vec3): Vec3 => {
		const qx = q[0];
		const qy = q[1];
		const qz = q[2];
		const qw = q[3];

		const uvx = qy * v[2] - qz * v[1];
		const uvy = qz * v[0] - qx * v[2];
		const uvz = qx * v[1] - qy * v[0];

		const uuvx = qy * uvz - qz * uvy;
		const uuvy = qz * uvx - qx * uvz;
		const uuvz = qx * uvy - qy * uvx;

		return [
			v[0] + 2 * (qw * uvx + uuvx),
			v[1] + 2 * (qw * uvy + uuvy),
			v[2] + 2 * (qw * uvz + uuvz)
		];
	};

	const cubelets = initializeCubelets();
	const gridPositionBuffer = new Float32Array(CUBE_COUNT * ENTRY_STRIDE);
	const worldPositionBuffer = new Float32Array(CUBE_COUNT * ENTRY_STRIDE);
	const worldQuaternionBuffer = new Float32Array(CUBE_COUNT * ENTRY_STRIDE);
	const invWorldQuaternionBuffer = new Float32Array(CUBE_COUNT * ENTRY_STRIDE);

	let currentMove: Move | null = null;
	let isAnimating = false;
	let moveProgress = 0;
	let currentMoveAngle = 0;
	let lastMoveAxis: Axis | null = null;
	let timeSinceLastMove = 0;

	let isDragging = false;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let lastPointerTime = 0;
	let sceneQuat: Quat = [0, 0, 0, 1];
	let dragVelocityY = 0;
	let dragVelocityX = 0;
	let momentumVelocityY = 0;
	let momentumVelocityX = 0;

	const applyOrbitDelta = (horizontalDelta: number, verticalDelta: number) => {
		const angle = Math.hypot(horizontalDelta, verticalDelta);
		if (angle < 1e-6) return;

		// Screen-space trackball: drag right always rotates around screen up, drag up/down around screen right.
		const axis: Vec3 = [verticalDelta / angle, horizontalDelta / angle, 0];
		const qDelta = quatFromAxisAngle(axis, angle);
		sceneQuat = quatMultiply(qDelta, sceneQuat);
	};

	const updateSceneBuffers = (
		sceneQuat: Quat,
		spacing: number,
		moveQuat: Quat,
		activeAxisIndex: 0 | 1 | 2 | null,
		activeLayer: Layer
	) => {
		for (let index = 0; index < CUBE_COUNT; index += 1) {
			const cubelet = cubelets[index];
			let gridPos: Vec3 = cubelet.position;
			let cubeQuat: Quat = cubelet.quaternion;

			if (activeAxisIndex !== null && Math.round(gridPos[activeAxisIndex]) === activeLayer) {
				gridPos = quatRotateVec(moveQuat, gridPos);
				cubeQuat = quatMultiply(moveQuat, cubeQuat);
			}

			const scaledGrid: Vec3 = [gridPos[0] * spacing, gridPos[1] * spacing, gridPos[2] * spacing];
			const worldPos = quatRotateVec(sceneQuat, scaledGrid);
			const worldQuat = quatMultiply(sceneQuat, cubeQuat);
			const invWorldQuat = quatConjugate(worldQuat);
			const base = index * ENTRY_STRIDE;

			gridPositionBuffer[base] = gridPos[0];
			gridPositionBuffer[base + 1] = gridPos[1];
			gridPositionBuffer[base + 2] = gridPos[2];
			gridPositionBuffer[base + 3] = 1;

			worldPositionBuffer[base] = worldPos[0];
			worldPositionBuffer[base + 1] = worldPos[1];
			worldPositionBuffer[base + 2] = worldPos[2];
			worldPositionBuffer[base + 3] = 1;

			worldQuaternionBuffer[base] = worldQuat[0];
			worldQuaternionBuffer[base + 1] = worldQuat[1];
			worldQuaternionBuffer[base + 2] = worldQuat[2];
			worldQuaternionBuffer[base + 3] = worldQuat[3];

			invWorldQuaternionBuffer[base] = invWorldQuat[0];
			invWorldQuaternionBuffer[base + 1] = invWorldQuat[1];
			invWorldQuaternionBuffer[base + 2] = invWorldQuat[2];
			invWorldQuaternionBuffer[base + 3] = invWorldQuat[3];
		}
	};

	const commitMove = () => {
		if (!currentMove) return;

		const axisVector = AXIS_VECTORS[currentMove.axis];
		const axisIndex = AXIS_INDEX[currentMove.axis];
		const angle = HALF_PI * currentMove.direction;
		const deltaQ = quatFromAxisAngle(axisVector, angle);

		for (const cubelet of cubelets) {
			if (Math.round(cubelet.position[axisIndex]) !== currentMove.layer) {
				continue;
			}

			const rotated = quatRotateVec(deltaQ, cubelet.position);
			cubelet.position = [
				Math.round(rotated[0]) as Layer,
				Math.round(rotated[1]) as Layer,
				Math.round(rotated[2]) as Layer
			];
			cubelet.quaternion = quatMultiply(deltaQ, cubelet.quaternion);
		}

		isAnimating = false;
		moveProgress = 0;
		currentMoveAngle = 0;
		currentMove = null;
		timeSinceLastMove = 0;
	};

	const beginMove = (move: Move) => {
		if (isAnimating) return;
		currentMove = move;
		lastMoveAxis = move.axis;
		isAnimating = true;
		moveProgress = 0;
		currentMoveAngle = 0;
	};

	const selectNextMove = () => {
		const candidates = POSSIBLE_MOVES.filter((move) => move.axis !== lastMoveAxis);
		if (candidates.length === 0) {
			return;
		}
		const next = candidates[Math.floor(Math.random() * candidates.length)];
		beginMove(next);
	};

	onMount(() => {
		const canvas = motion.canvas;
		if (!canvas) return;

		canvas.style.cursor = 'grab';
		canvas.style.touchAction = 'none';

		const handlePointerDown = (event: PointerEvent) => {
			isDragging = true;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			lastPointerTime = performance.now();
			dragVelocityY = 0;
			dragVelocityX = 0;
			momentumVelocityY = 0;
			momentumVelocityX = 0;
			canvas.style.cursor = 'grabbing';
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (!isDragging) return;
			const now = performance.now();
			const dx = event.clientX - lastPointerX;
			const dy = event.clientY - lastPointerY;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			const dt = Math.max(0.001, (now - lastPointerTime) * 0.001);
			lastPointerTime = now;

			const rotateDeltaY = dx * DRAG_SENSITIVITY;
			const rotateDeltaX = dy * DRAG_SENSITIVITY;
			applyOrbitDelta(rotateDeltaY, rotateDeltaX);

			const instantVelocityY = rotateDeltaY / dt;
			const instantVelocityX = rotateDeltaX / dt;
			dragVelocityY += (instantVelocityY - dragVelocityY) * DRAG_VELOCITY_SMOOTHING;
			dragVelocityX += (instantVelocityX - dragVelocityX) * DRAG_VELOCITY_SMOOTHING;
		};

		const endDrag = () => {
			if (!isDragging) return;
			isDragging = false;
			momentumVelocityY = dragVelocityY;
			momentumVelocityX = dragVelocityX;
			canvas.style.cursor = 'grab';
		};

		canvas.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', endDrag);
		canvas.addEventListener('pointercancel', endDrag);

		return () => {
			canvas.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', endDrag);
			canvas.removeEventListener('pointercancel', endDrag);
		};
	});

	useFrame((state) => {
		let yawDelta = 0;
		let pitchDelta = 0;

		if (!isDragging) {
			yawDelta += state.delta * AUTO_ROTATE_SPEED;
			yawDelta += momentumVelocityY * state.delta;
			pitchDelta += momentumVelocityX * state.delta;

			const decay = Math.exp(-MOMENTUM_DECAY * state.delta);
			momentumVelocityY *= decay;
			momentumVelocityX *= decay;

			if (Math.abs(momentumVelocityY) < MOMENTUM_MIN_SPEED) {
				momentumVelocityY = 0;
			}
			if (Math.abs(momentumVelocityX) < MOMENTUM_MIN_SPEED) {
				momentumVelocityX = 0;
			}
		}

		applyOrbitDelta(yawDelta, pitchDelta);

		if (isAnimating && currentMove) {
			moveProgress = Math.min(1, moveProgress + state.delta / MOVE_DURATION);
			const eased = easeInOutCubic(moveProgress);
			currentMoveAngle = HALF_PI * currentMove.direction * eased;

			if (moveProgress >= 1) {
				commitMove();
			}
		} else {
			timeSinceLastMove += state.delta;
			if (timeSinceLastMove >= MOVE_DELAY) {
				selectNextMove();
			}
		}

		const currentSceneQuat: Quat = sceneQuat;
		const canvas = motion.canvas;
		let cubeScale = BASE_CUBE_SCALE;
		let cubeGap = BASE_CUBE_GAP;
		let roundRadius = BASE_ROUND_RADIUS;
		let sceneBound = 2.7;

		if (canvas) {
			const shortEdge = Math.max(320, Math.min(canvas.clientWidth, canvas.clientHeight));
			const sizeFactor = Math.max(0.7, Math.min(1.18, shortEdge / REFERENCE_VIEWPORT));
			cubeScale = BASE_CUBE_SCALE * sizeFactor;
			cubeGap = BASE_CUBE_GAP * sizeFactor;
			roundRadius = Math.min(BASE_ROUND_RADIUS * sizeFactor, cubeScale * 0.22);

			const spacingForBounds = cubeScale + cubeGap;
			const clusterHalfExtent = spacingForBounds + cubeScale * 0.5;
			sceneBound = Math.sqrt(3) * clusterHalfExtent + 0.42;
		}

		const spacing = cubeScale + cubeGap;
		let activeMoveQuat = IDENTITY_QUAT;
		let activeAxisIndex: 0 | 1 | 2 | null = null;
		let activeLayer: Layer = 0;

		if (isAnimating && currentMove) {
			activeMoveQuat = quatFromAxisAngle(AXIS_VECTORS[currentMove.axis], currentMoveAngle);
			activeAxisIndex = AXIS_INDEX[currentMove.axis];
			activeLayer = currentMove.layer;
		}

		updateSceneBuffers(currentSceneQuat, spacing, activeMoveQuat, activeAxisIndex, activeLayer);

		state.setUniform('uCubeScale', cubeScale);
		state.setUniform('uRoundRadius', roundRadius);
		state.setUniform('uSceneBound', sceneBound);

		state.writeStorageBuffer('cubeGridPositions', gridPositionBuffer);
		state.writeStorageBuffer('cubeWorldPositions', worldPositionBuffer);
		state.writeStorageBuffer('cubeWorldQuaternions', worldQuaternionBuffer);
		state.writeStorageBuffer('cubeInvWorldQuaternions', invWorldQuaternionBuffer);
	});
</script>
