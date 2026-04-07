import { useCallback, useEffect, useRef } from 'react';
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
 * Normalizes click button configuration with a primary-button fallback.
 */
function normalizeClickButtons(buttons: number[] | undefined): Set<number> {
	const source = buttons && buttons.length > 0 ? buttons : [0];
	return new Set(source);
}

/**
 * Tracks normalized pointer coordinates and click/tap snapshots for the active `FragCanvas`.
 */
export function usePointer(options: UsePointerOptions = {}): UsePointerResult {
	const motiongpu = useMotionGPU();
	const stateRef = useRef(currentWritable<PointerState>(createInitialPointerState()));
	const clickRef = useRef(currentWritable<PointerClick | null>(null));
	const optionsRef = useRef(options);
	const activePointerIdRef = useRef<number | null>(null);
	const downSnapshotRef = useRef<PointerDownSnapshot | null>(null);
	const clickCounterRef = useRef(0);
	const previousPxRef = useRef<PointerVec2 | null>(null);
	const previousUvRef = useRef<PointerVec2 | null>(null);
	const previousTimeSecondsRef = useRef(0);

	optionsRef.current = options;

	const requestFrame = useCallback((): void => {
		const mode = resolvePointerFrameRequestMode(
			optionsRef.current.requestFrame ?? 'auto',
			motiongpu.renderMode.current
		);
		if (mode === 'invalidate') {
			motiongpu.invalidate();
			return;
		}
		if (mode === 'advance') {
			motiongpu.advance();
		}
	}, [motiongpu]);

	/**
	 * Commits a full pointer state snapshot with computed delta and velocity vectors.
	 */
	const updatePointerState = useCallback(
		(input: {
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
			const previousTimeSeconds = previousTimeSecondsRef.current;
			const dt = previousTimeSeconds > 0 ? Math.max(nowSeconds - previousTimeSeconds, 1e-6) : 0;
			const previousPx = previousPxRef.current;
			const previousUv = previousUvRef.current;
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
			stateRef.current.set(nextState);
			previousPxRef.current = input.point.px;
			previousUvRef.current = input.point.uv;
			previousTimeSecondsRef.current = nowSeconds;
			requestFrame();
			return nextState;
		},
		[requestFrame]
	);

	useEffect(() => {
		const enabled = optionsRef.current.enabled ?? true;
		if (!enabled) {
			return;
		}

		const canvas = motiongpu.canvas;
		if (!canvas) {
			return;
		}

		const isTrackedPointer = (event: PointerEvent): boolean =>
			activePointerIdRef.current === null || event.pointerId === activePointerIdRef.current;

		const handlePointerDown = (event: PointerEvent): void => {
			const point = getPointerCoordinates(
				event.clientX,
				event.clientY,
				canvas.getBoundingClientRect()
			);
			const pointerType = normalizePointerKind(event.pointerType);
			activePointerIdRef.current = event.pointerId;
			downSnapshotRef.current = {
				pointerId: event.pointerId,
				pointerType,
				button: event.button,
				timeMs: getPointerNowSeconds() * 1000,
				px: point.px,
				uv: point.uv,
				inside: point.inside
			};
			if (optionsRef.current.capturePointer ?? true) {
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
			optionsRef.current.onDown?.(nextState, event);
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
			const pressed =
				activePointerIdRef.current !== null && event.pointerId === activePointerIdRef.current;
			const downPx = pressed ? (downSnapshotRef.current?.px ?? point.px) : null;
			const downUv = pressed ? (downSnapshotRef.current?.uv ?? point.uv) : null;
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
				button: pressed ? (downSnapshotRef.current?.button ?? event.button) : null,
				buttons: event.buttons,
				downPx,
				downUv
			});
			optionsRef.current.onMove?.(nextState, event);
		};

		const handleWindowMove = (event: PointerEvent): void => {
			if (
				!(optionsRef.current.trackWhilePressedOutsideCanvas ?? true) ||
				activePointerIdRef.current === null ||
				event.pointerId !== activePointerIdRef.current
			) {
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

			const downPx = downSnapshotRef.current?.px ?? point.px;
			const downUv = downSnapshotRef.current?.uv ?? point.uv;
			const dx = point.px[0] - downPx[0];
			const dy = point.px[1] - downPx[1];
			const nextState = updatePointerState({
				point,
				inside: false,
				pressed: true,
				dragging: Math.hypot(dx, dy) > 0,
				pointerType:
					downSnapshotRef.current?.pointerType ?? normalizePointerKind(event.pointerType),
				pointerId: event.pointerId,
				button: downSnapshotRef.current?.button ?? event.button,
				buttons: event.buttons,
				downPx,
				downUv
			});
			optionsRef.current.onMove?.(nextState, event);
		};

		const releasePointer = (event: PointerEvent, emitClick: boolean): void => {
			if (activePointerIdRef.current === null || event.pointerId !== activePointerIdRef.current) {
				return;
			}

			const point = getPointerCoordinates(
				event.clientX,
				event.clientY,
				canvas.getBoundingClientRect()
			);
			const previous = downSnapshotRef.current;
			const pointerType = previous?.pointerType ?? normalizePointerKind(event.pointerType);
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
			optionsRef.current.onUp?.(nextState, event);

			if (
				(optionsRef.current.capturePointer ?? true) &&
				canvas.hasPointerCapture(event.pointerId)
			) {
				try {
					canvas.releasePointerCapture(event.pointerId);
				} catch {
					// Browser rejected release for this pointer id.
				}
			}

			if (emitClick && (optionsRef.current.clickEnabled ?? true) && previous) {
				const allowedButtons = normalizeClickButtons(optionsRef.current.clickButtons);
				if (allowedButtons.has(previous.button)) {
					const clickMaxDurationMs = resolveClickMaxDurationMs(
						optionsRef.current.clickMaxDurationMs
					);
					const clickMaxMovePx = resolveClickMaxMovePx(optionsRef.current.clickMaxMovePx);
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
						clickCounterRef.current += 1;
						const click: PointerClick = {
							id: clickCounterRef.current,
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
						clickRef.current.set(click);
						optionsRef.current.onClick?.(click, nextState, event);
						requestFrame();
					}
				}
			}

			activePointerIdRef.current = null;
			downSnapshotRef.current = null;
		};

		const handlePointerUp = (event: PointerEvent): void => {
			releasePointer(event, true);
		};

		const handlePointerCancel = (event: PointerEvent): void => {
			releasePointer(event, false);
		};

		const handlePointerLeave = (): void => {
			if (activePointerIdRef.current !== null) {
				return;
			}
			const current = stateRef.current.current;
			stateRef.current.set({
				...current,
				inside: false,
				time: getPointerNowSeconds(),
				deltaPx: [0, 0],
				deltaUv: [0, 0],
				velocityPx: [0, 0],
				velocityUv: [0, 0]
			});
			requestFrame();
		};

		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handleMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerCancel);
		canvas.addEventListener('pointerleave', handlePointerLeave);
		if (optionsRef.current.trackWhilePressedOutsideCanvas ?? true) {
			window.addEventListener('pointermove', handleWindowMove);
			window.addEventListener('pointerup', handlePointerUp);
			window.addEventListener('pointercancel', handlePointerCancel);
		}

		return () => {
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('pointermove', handleMove);
			canvas.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointercancel', handlePointerCancel);
			canvas.removeEventListener('pointerleave', handlePointerLeave);
			window.removeEventListener('pointermove', handleWindowMove);
			window.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointercancel', handlePointerCancel);
		};
	}, [motiongpu, requestFrame, updatePointerState]);

	return {
		state: stateRef.current,
		lastClick: clickRef.current,
		resetClick: useCallback(() => {
			clickRef.current.set(null);
		}, [])
	};
}
