import { onBeforeUnmount, onMounted } from 'vue';
import {
	createCurrentWritable as currentWritable,
	type CurrentReadable
} from '../core/current-value.js';
import {
	createInitialPointerState,
	getPointerCoordinates,
	getPointerNowSeconds,
	normalizePointerKind,
	resolvePointerFrameRequestMode,
	type PointerClick,
	type PointerFrameRequestMode,
	type PointerState,
	type PointerVec2
} from '../core/pointer.js';
import { useMotionGPU } from './motiongpu-context.js';

export type {
	PointerClick,
	PointerFrameRequestMode,
	PointerKind,
	PointerPoint,
	PointerState
} from '../core/pointer.js';

/**
 * Configuration for pointer input handling in `usePointer`.
 */
export interface UsePointerOptions {
	/**
	 * Enables pointer listeners.
	 *
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * Frame wake-up strategy for pointer-driven state changes.
	 *
	 * @default 'auto'
	 */
	requestFrame?: PointerFrameRequestMode;
	/**
	 * Requests pointer capture on pointer down.
	 *
	 * @default true
	 */
	capturePointer?: boolean;
	/**
	 * Tracks pointer move/up outside canvas while pointer is pressed.
	 *
	 * @default true
	 */
	trackWhilePressedOutsideCanvas?: boolean;
	/**
	 * Enables click/tap synthesis on pointer up.
	 *
	 * @default true
	 */
	clickEnabled?: boolean;
	/**
	 * Maximum press duration to consider pointer up a click (milliseconds).
	 *
	 * @default 350
	 */
	clickMaxDurationMs?: number;
	/**
	 * Maximum pointer travel from down to up to consider pointer up a click (pixels).
	 *
	 * @default 8
	 */
	clickMaxMovePx?: number;
	/**
	 * Allowed pointer buttons for click synthesis.
	 *
	 * @default [0]
	 */
	clickButtons?: number[];
	/**
	 * Called after pointer move state update.
	 */
	onMove?: (state: PointerState, event: PointerEvent) => void;
	/**
	 * Called after pointer down state update.
	 */
	onDown?: (state: PointerState, event: PointerEvent) => void;
	/**
	 * Called after pointer up/cancel state update.
	 */
	onUp?: (state: PointerState, event: PointerEvent) => void;
	/**
	 * Called when click/tap is synthesized.
	 */
	onClick?: (click: PointerClick, state: PointerState, event: PointerEvent) => void;
}

/**
 * Reactive state returned by `usePointer`.
 */
export interface UsePointerResult {
	/**
	 * Current pointer state.
	 */
	state: CurrentReadable<PointerState>;
	/**
	 * Last synthesized click/tap event.
	 */
	lastClick: CurrentReadable<PointerClick | null>;
	/**
	 * Clears last click snapshot.
	 */
	resetClick: () => void;
}

interface PointerDownSnapshot {
	button: number;
	inside: boolean;
	pointerId: number;
	pointerType: 'mouse' | 'pen' | 'touch';
	px: PointerVec2;
	timeMs: number;
	uv: PointerVec2;
}

/**
 * Normalizes click button configuration with a primary-button fallback.
 */
function normalizeClickButtons(buttons: number[] | undefined): Set<number> {
	const source = buttons && buttons.length > 0 ? buttons : [0];
	return new Set(source);
}

/**
 * Resolves a valid click duration threshold in milliseconds.
 */
function resolveClickMaxDurationMs(value: number | undefined): number {
	if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
		return 350;
	}

	return value;
}

/**
 * Resolves a valid click travel threshold in pixels.
 */
function resolveClickMaxMovePx(value: number | undefined): number {
	if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
		return 8;
	}

	return value;
}

/**
 * Tracks normalized pointer coordinates and click/tap snapshots for the active `FragCanvas`.
 */
export function usePointer(options: UsePointerOptions = {}): UsePointerResult {
	const motiongpu = useMotionGPU();
	const pointerState = currentWritable<PointerState>(createInitialPointerState());
	const lastClick = currentWritable<PointerClick | null>(null);
	const enabled = options.enabled ?? true;
	const requestFrameMode = options.requestFrame ?? 'auto';
	const capturePointer = options.capturePointer ?? true;
	const trackOutside = options.trackWhilePressedOutsideCanvas ?? true;
	const clickEnabled = options.clickEnabled ?? true;
	const clickMaxDurationMs = resolveClickMaxDurationMs(options.clickMaxDurationMs);
	const clickMaxMovePx = resolveClickMaxMovePx(options.clickMaxMovePx);
	const clickButtons = normalizeClickButtons(options.clickButtons);
	let activePointerId: number | null = null;
	let downSnapshot: PointerDownSnapshot | null = null;
	let clickCounter = 0;
	let previousPx: PointerVec2 | null = null;
	let previousUv: PointerVec2 | null = null;
	let previousTimeSeconds = 0;
	let cleanup: (() => void) | null = null;

	const requestFrame = (): void => {
		const mode = resolvePointerFrameRequestMode(requestFrameMode, motiongpu.renderMode.current);
		if (mode === 'invalidate') {
			motiongpu.invalidate();
			return;
		}
		if (mode === 'advance') {
			motiongpu.advance();
		}
	};

	/**
	 * Commits a full pointer state snapshot with computed delta and velocity vectors.
	 */
	const updatePointerState = (input: {
		button: number | null;
		buttons: number;
		downPx: PointerVec2 | null;
		downUv: PointerVec2 | null;
		dragging: boolean;
		inside: boolean;
		pointerId: number | null;
		pointerType: 'mouse' | 'pen' | 'touch' | null;
		pressed: boolean;
		point: {
			ndc: PointerVec2;
			px: PointerVec2;
			uv: PointerVec2;
		};
		resetDelta?: boolean;
	}): PointerState => {
		const nowSeconds = getPointerNowSeconds();
		const dt = previousTimeSeconds > 0 ? Math.max(nowSeconds - previousTimeSeconds, 1e-6) : 0;
		const deltaPx: PointerVec2 =
			input.resetDelta || !previousPx
				? [0, 0]
				: [input.point.px[0] - previousPx[0], input.point.px[1] - previousPx[1]];
		const deltaUv: PointerVec2 =
			input.resetDelta || !previousUv
				? [0, 0]
				: [input.point.uv[0] - previousUv[0], input.point.uv[1] - previousUv[1]];
		const velocityPx: PointerVec2 = dt > 0 ? [deltaPx[0] / dt, deltaPx[1] / dt] : [0, 0];
		const velocityUv: PointerVec2 = dt > 0 ? [deltaUv[0] / dt, deltaUv[1] / dt] : [0, 0];
		const nextState: PointerState = {
			px: input.point.px,
			uv: input.point.uv,
			ndc: input.point.ndc,
			inside: input.inside,
			pressed: input.pressed,
			dragging: input.dragging,
			pointerType: input.pointerType,
			pointerId: input.pointerId,
			button: input.button,
			buttons: input.buttons,
			time: nowSeconds,
			downPx: input.downPx,
			downUv: input.downUv,
			deltaPx,
			deltaUv,
			velocityPx,
			velocityUv
		};
		pointerState.set(nextState);
		previousPx = input.point.px;
		previousUv = input.point.uv;
		previousTimeSeconds = nowSeconds;
		requestFrame();
		return nextState;
	};

	/**
	 * Updates only the `inside` flag while keeping the latest pointer coordinates.
	 */
	const updateInsideState = (inside: boolean): PointerState => {
		const current = pointerState.current;
		const nextState: PointerState = {
			...current,
			inside,
			time: getPointerNowSeconds(),
			deltaPx: [0, 0],
			deltaUv: [0, 0],
			velocityPx: [0, 0],
			velocityUv: [0, 0]
		};
		pointerState.set(nextState);
		requestFrame();
		return nextState;
	};

	/**
	 * Checks whether an event belongs to the active tracked pointer.
	 */
	const isTrackedPointer = (event: PointerEvent): boolean =>
		activePointerId === null || event.pointerId === activePointerId;

	const attachListeners = (): void => {
		if (!enabled) {
			return;
		}

		const canvas = motiongpu.canvas;
		if (!canvas) {
			return;
		}

		const handlePointerDown = (event: PointerEvent): void => {
			const point = getPointerCoordinates(
				event.clientX,
				event.clientY,
				canvas.getBoundingClientRect()
			);
			const pointerType = normalizePointerKind(event.pointerType);
			activePointerId = event.pointerId;
			downSnapshot = {
				pointerId: event.pointerId,
				pointerType,
				button: event.button,
				timeMs: getPointerNowSeconds() * 1000,
				px: point.px,
				uv: point.uv,
				inside: point.inside
			};
			if (capturePointer) {
				try {
					canvas.setPointerCapture(event.pointerId);
				} catch {
					// Browser rejected capture (e.g. unsupported pointer state).
				}
			}
			const nextState = updatePointerState({
				point,
				inside: point.inside,
				pressed: true,
				dragging: false,
				pointerType,
				pointerId: event.pointerId,
				button: event.button,
				buttons: event.buttons,
				downPx: point.px,
				downUv: point.uv,
				resetDelta: true
			});
			options.onDown?.(nextState, event);
		};

		const handleMove = (event: PointerEvent): void => {
			if (!isTrackedPointer(event)) {
				return;
			}

			const point = getPointerCoordinates(
				event.clientX,
				event.clientY,
				canvas.getBoundingClientRect()
			);
			const pressed = activePointerId !== null && event.pointerId === activePointerId;
			const downPx = pressed ? (downSnapshot?.px ?? point.px) : null;
			const downUv = pressed ? (downSnapshot?.uv ?? point.uv) : null;
			let dragging = false;
			if (pressed && downPx) {
				const dx = point.px[0] - downPx[0];
				const dy = point.px[1] - downPx[1];
				dragging = Math.hypot(dx, dy) > 0;
			}
			const nextState = updatePointerState({
				point,
				inside: point.inside,
				pressed,
				dragging,
				pointerType: normalizePointerKind(event.pointerType),
				pointerId: event.pointerId,
				button: pressed ? (downSnapshot?.button ?? event.button) : null,
				buttons: event.buttons,
				downPx,
				downUv
			});
			options.onMove?.(nextState, event);
		};

		const handleWindowMove = (event: PointerEvent): void => {
			if (!trackOutside || activePointerId === null || event.pointerId !== activePointerId) {
				return;
			}

			const point = getPointerCoordinates(
				event.clientX,
				event.clientY,
				canvas.getBoundingClientRect()
			);
			if (point.inside) {
				return;
			}
			const downPx = downSnapshot?.px ?? point.px;
			const downUv = downSnapshot?.uv ?? point.uv;
			const dx = point.px[0] - downPx[0];
			const dy = point.px[1] - downPx[1];
			const nextState = updatePointerState({
				point,
				inside: false,
				pressed: true,
				dragging: Math.hypot(dx, dy) > 0,
				pointerType: downSnapshot?.pointerType ?? normalizePointerKind(event.pointerType),
				pointerId: event.pointerId,
				button: downSnapshot?.button ?? event.button,
				buttons: event.buttons,
				downPx,
				downUv
			});
			options.onMove?.(nextState, event);
		};

		const releasePointer = (event: PointerEvent, emitClick: boolean): void => {
			if (activePointerId === null || event.pointerId !== activePointerId) {
				return;
			}

			const point = getPointerCoordinates(
				event.clientX,
				event.clientY,
				canvas.getBoundingClientRect()
			);
			const pointerType = downSnapshot?.pointerType ?? normalizePointerKind(event.pointerType);
			const previous = downSnapshot;
			const nextState = updatePointerState({
				point,
				inside: point.inside,
				pressed: false,
				dragging: false,
				pointerType,
				pointerId: null,
				button: null,
				buttons: event.buttons,
				downPx: null,
				downUv: null
			});
			options.onUp?.(nextState, event);

			if (capturePointer && canvas.hasPointerCapture(event.pointerId)) {
				try {
					canvas.releasePointerCapture(event.pointerId);
				} catch {
					// Browser rejected release for this pointer id.
				}
			}

			if (emitClick && clickEnabled && previous && clickButtons.has(previous.button)) {
				const durationMs = getPointerNowSeconds() * 1000 - previous.timeMs;
				const dx = point.px[0] - previous.px[0];
				const dy = point.px[1] - previous.px[1];
				const moveDistance = Math.hypot(dx, dy);
				if (
					previous.inside &&
					point.inside &&
					durationMs <= clickMaxDurationMs &&
					moveDistance <= clickMaxMovePx
				) {
					clickCounter += 1;
					const click: PointerClick = {
						id: clickCounter,
						time: getPointerNowSeconds(),
						pointerType,
						pointerId: event.pointerId,
						button: previous.button,
						modifiers: {
							alt: event.altKey,
							ctrl: event.ctrlKey,
							shift: event.shiftKey,
							meta: event.metaKey
						},
						px: point.px,
						uv: point.uv,
						ndc: point.ndc
					};
					lastClick.set(click);
					options.onClick?.(click, nextState, event);
					requestFrame();
				}
			}

			activePointerId = null;
			downSnapshot = null;
		};

		const handlePointerUp = (event: PointerEvent): void => {
			releasePointer(event, true);
		};

		const handlePointerCancel = (event: PointerEvent): void => {
			releasePointer(event, false);
		};

		const handlePointerLeave = (): void => {
			if (activePointerId !== null) {
				return;
			}
			updateInsideState(false);
		};

		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handleMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerCancel);
		canvas.addEventListener('pointerleave', handlePointerLeave);
		if (trackOutside) {
			window.addEventListener('pointermove', handleWindowMove);
			window.addEventListener('pointerup', handlePointerUp);
			window.addEventListener('pointercancel', handlePointerCancel);
		}

		cleanup = (): void => {
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('pointermove', handleMove);
			canvas.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointercancel', handlePointerCancel);
			canvas.removeEventListener('pointerleave', handlePointerLeave);
			if (trackOutside) {
				window.removeEventListener('pointermove', handleWindowMove);
				window.removeEventListener('pointerup', handlePointerUp);
				window.removeEventListener('pointercancel', handlePointerCancel);
			}
		};
	};

	onMounted(attachListeners);
	onBeforeUnmount(() => {
		cleanup?.();
		cleanup = null;
	});

	return {
		state: pointerState,
		lastClick,
		resetClick: () => {
			lastClick.set(null);
		}
	};
}
