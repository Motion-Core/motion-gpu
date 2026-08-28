import { createCurrentWritable, type CurrentReadable } from './current-value.js';
import type { RenderMode } from './types.js';

/**
 * Pointer kind normalized from DOM `PointerEvent.pointerType`.
 */
export type PointerKind = 'mouse' | 'pen' | 'touch';

/**
 * 2D tuple used by pointer coordinate payloads.
 */
export type PointerVec2 = [number, number];

/**
 * Normalized pointer coordinates exposed to runtime hooks.
 */
export interface PointerPoint {
	/**
	 * CSS pixel coordinates relative to canvas top-left corner.
	 */
	px: PointerVec2;
	/**
	 * UV coordinates in shader-friendly orientation (`y` grows upward).
	 */
	uv: PointerVec2;
	/**
	 * Normalized device coordinates (`-1..1`, `y` grows upward).
	 */
	ndc: PointerVec2;
}

/**
 * Mutable pointer state snapshot exposed by `usePointer`.
 */
export interface PointerState extends PointerPoint {
	inside: boolean;
	pressed: boolean;
	dragging: boolean;
	pointerType: PointerKind | null;
	pointerId: number | null;
	button: number | null;
	buttons: number;
	time: number;
	downPx: PointerVec2 | null;
	downUv: PointerVec2 | null;
	deltaPx: PointerVec2;
	deltaUv: PointerVec2;
	velocityPx: PointerVec2;
	velocityUv: PointerVec2;
}

/**
 * Modifier key snapshot attached to pointer click events.
 */
export interface PointerModifiers {
	alt: boolean;
	ctrl: boolean;
	shift: boolean;
	meta: boolean;
}

/**
 * Click/tap payload produced by `usePointer`.
 */
export interface PointerClick extends PointerPoint {
	id: number;
	time: number;
	pointerType: PointerKind;
	pointerId: number;
	button: number;
	modifiers: PointerModifiers;
}

/**
 * Frame wake-up strategy for pointer-driven interactions.
 */
export type PointerFrameRequestMode = 'advance' | 'auto' | 'invalidate' | 'none';

/**
 * Returns a monotonic timestamp in seconds.
 */
export function getPointerNowSeconds(): number {
	if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
		return performance.now() / 1000;
	}

	return Date.now() / 1000;
}

/**
 * Creates the initial pointer state snapshot.
 */
export function createInitialPointerState(): PointerState {
	return {
		px: [0, 0],
		uv: [0, 0],
		ndc: [-1, -1],
		inside: false,
		pressed: false,
		dragging: false,
		pointerType: null,
		pointerId: null,
		button: null,
		buttons: 0,
		time: getPointerNowSeconds(),
		downPx: null,
		downUv: null,
		deltaPx: [0, 0],
		deltaUv: [0, 0],
		velocityPx: [0, 0],
		velocityUv: [0, 0]
	};
}

/**
 * Normalized coordinate payload for a pointer position against a canvas rect.
 */
export interface PointerCoordinates extends PointerPoint {
	inside: boolean;
}

/**
 * Converts client coordinates to canvas-relative pointer coordinates.
 */
export function getPointerCoordinates(
	clientX: number,
	clientY: number,
	rect: Pick<DOMRectReadOnly, 'height' | 'left' | 'top' | 'width'>
): PointerCoordinates {
	const width = Math.max(rect.width, 1);
	const height = Math.max(rect.height, 1);
	const nx = (clientX - rect.left) / width;
	const ny = (clientY - rect.top) / height;
	const pxX = clientX - rect.left;
	const pxY = clientY - rect.top;
	const uvX = nx;
	const uvY = 1 - ny;

	return {
		px: [pxX, pxY],
		uv: [uvX, uvY],
		ndc: [nx * 2 - 1, uvY * 2 - 1],
		inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1
	};
}

/**
 * Resolves frame wake-up strategy for pointer-driven updates.
 */
export function resolvePointerFrameRequestMode(
	mode: PointerFrameRequestMode,
	renderMode: RenderMode
): Exclude<PointerFrameRequestMode, 'auto'> {
	if (mode !== 'auto') {
		return mode;
	}

	if (renderMode === 'manual') {
		return 'advance';
	}

	if (renderMode === 'on-demand') {
		return 'invalidate';
	}

	return 'none';
}

/**
 * Normalizes unknown pointer kind values to the public `PointerKind`.
 */
export function normalizePointerKind(pointerType: string): PointerKind {
	if (pointerType === 'mouse' || pointerType === 'pen' || pointerType === 'touch') {
		return pointerType;
	}

	return 'mouse';
}

/**
 * Framework-neutral options consumed by the pointer controller.
 */
export interface PointerControllerOptions {
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
 * Framework runtime operations required by the pointer controller.
 */
export interface PointerControllerRuntime {
	advance: () => void;
	getRenderMode: () => RenderMode;
	invalidate: () => void;
}

/**
 * Public pointer values shared by all framework adapters.
 */
export interface PointerControllerResult {
	state: CurrentReadable<PointerState>;
	lastClick: CurrentReadable<PointerClick | null>;
	resetClick: () => void;
}

/**
 * Framework-neutral pointer lifecycle controller.
 */
export interface PointerController extends PointerControllerResult {
	destroy: () => void;
	mount: (canvas: HTMLCanvasElement) => void;
	updateOptions: (options: PointerControllerOptions) => void;
}

interface PointerDownSnapshot {
	button: number;
	inside: boolean;
	pointerId: number;
	pointerType: PointerKind;
	px: PointerVec2;
	timeMs: number;
	uv: PointerVec2;
}

interface PointerStateInput {
	button: number | null;
	buttons: number;
	downPx: PointerVec2 | null;
	downUv: PointerVec2 | null;
	dragging: boolean;
	inside: boolean;
	pointerId: number | null;
	pointerType: PointerKind | null;
	pressed: boolean;
	point: PointerPoint;
	resetDelta?: boolean;
}

function resolveClickMaxDurationMs(value: number | undefined): number {
	if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
		return 350;
	}

	return value;
}

function resolveClickMaxMovePx(value: number | undefined): number {
	if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
		return 8;
	}

	return value;
}

function normalizeClickButtons(buttons: number[] | undefined): Set<number> {
	const source = buttons && buttons.length > 0 ? buttons : [0];
	return new Set(source);
}

/**
 * Creates the shared pointer controller used by every framework adapter.
 */
export function createPointerController(
	runtime: PointerControllerRuntime,
	initialOptions: PointerControllerOptions = {}
): PointerController {
	const state = createCurrentWritable<PointerState>(createInitialPointerState());
	const lastClick = createCurrentWritable<PointerClick | null>(null);
	let options = initialOptions;
	let canvas: HTMLCanvasElement | null = null;
	let windowTarget: Window | null = null;
	let canvasListenersAttached = false;
	let windowListenersAttached = false;
	let activePointerId: number | null = null;
	let capturedPointerId: number | null = null;
	let downSnapshot: PointerDownSnapshot | null = null;
	let clickCounter = 0;
	let previousPx: PointerVec2 | null = null;
	let previousUv: PointerVec2 | null = null;
	let previousTimeSeconds = 0;

	const isEnabled = (): boolean => options.enabled ?? true;
	const shouldTrackOutside = (): boolean => options.trackWhilePressedOutsideCanvas ?? true;

	const requestFrame = (): void => {
		const mode = resolvePointerFrameRequestMode(
			options.requestFrame ?? 'auto',
			runtime.getRenderMode()
		);
		if (mode === 'invalidate') {
			runtime.invalidate();
			return;
		}
		if (mode === 'advance') {
			runtime.advance();
		}
	};

	const updatePointerState = (input: PointerStateInput): PointerState => {
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
		state.set(nextState);
		previousPx = input.point.px;
		previousUv = input.point.uv;
		previousTimeSeconds = nowSeconds;
		requestFrame();
		return nextState;
	};

	const updateInsideState = (inside: boolean): void => {
		const current = state.current;
		state.set({
			...current,
			inside,
			time: getPointerNowSeconds(),
			deltaPx: [0, 0],
			deltaUv: [0, 0],
			velocityPx: [0, 0],
			velocityUv: [0, 0]
		});
		requestFrame();
	};

	const releaseCapture = (): void => {
		if (!canvas || capturedPointerId === null) {
			capturedPointerId = null;
			return;
		}

		try {
			if (
				typeof canvas.hasPointerCapture !== 'function' ||
				canvas.hasPointerCapture(capturedPointerId)
			) {
				canvas.releasePointerCapture(capturedPointerId);
			}
		} catch {
			// Browser rejected release for this pointer id.
		}
		capturedPointerId = null;
	};

	const resetTracking = (emitFrame: boolean): void => {
		releaseCapture();
		activePointerId = null;
		downSnapshot = null;
		previousPx = null;
		previousUv = null;
		previousTimeSeconds = 0;

		const current = state.current;
		const shouldResetState =
			current.inside ||
			current.pressed ||
			current.dragging ||
			current.pointerId !== null ||
			current.button !== null ||
			current.buttons !== 0 ||
			current.downPx !== null ||
			current.downUv !== null;
		if (!shouldResetState) {
			return;
		}

		state.set({
			...current,
			inside: false,
			pressed: false,
			dragging: false,
			pointerId: null,
			button: null,
			buttons: 0,
			time: getPointerNowSeconds(),
			downPx: null,
			downUv: null,
			deltaPx: [0, 0],
			deltaUv: [0, 0],
			velocityPx: [0, 0],
			velocityUv: [0, 0]
		});
		if (emitFrame) {
			requestFrame();
		}
	};

	const handlePointerDown = (event: PointerEvent): void => {
		if (!canvas || activePointerId !== null) {
			return;
		}

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
		if (options.capturePointer ?? true) {
			try {
				canvas.setPointerCapture(event.pointerId);
				capturedPointerId = event.pointerId;
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

	const handlePointerMove = (event: PointerEvent): void => {
		if (!canvas || (activePointerId !== null && event.pointerId !== activePointerId)) {
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
		const dragging =
			pressed && downPx ? Math.hypot(point.px[0] - downPx[0], point.px[1] - downPx[1]) > 0 : false;
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

	const handleWindowPointerMove = (event: PointerEvent): void => {
		if (!canvas || activePointerId === null || event.pointerId !== activePointerId) {
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
		const nextState = updatePointerState({
			point,
			inside: false,
			pressed: true,
			dragging: Math.hypot(point.px[0] - downPx[0], point.px[1] - downPx[1]) > 0,
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
		if (!canvas || activePointerId === null || event.pointerId !== activePointerId) {
			return;
		}

		const point = getPointerCoordinates(
			event.clientX,
			event.clientY,
			canvas.getBoundingClientRect()
		);
		const previous = downSnapshot;
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
		options.onUp?.(nextState, event);
		releaseCapture();

		if (emitClick && (options.clickEnabled ?? true) && previous) {
			const allowedButtons = normalizeClickButtons(options.clickButtons);
			if (allowedButtons.has(previous.button)) {
				const durationMs = getPointerNowSeconds() * 1000 - previous.timeMs;
				const moveDistance = Math.hypot(point.px[0] - previous.px[0], point.px[1] - previous.px[1]);
				if (
					previous.inside &&
					point.inside &&
					durationMs <= resolveClickMaxDurationMs(options.clickMaxDurationMs) &&
					moveDistance <= resolveClickMaxMovePx(options.clickMaxMovePx)
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
		if (activePointerId === null) {
			updateInsideState(false);
		}
	};

	const attachWindowListeners = (): void => {
		if (windowListenersAttached || !windowTarget || !shouldTrackOutside()) {
			return;
		}

		windowTarget.addEventListener('pointermove', handleWindowPointerMove);
		windowTarget.addEventListener('pointerup', handlePointerUp);
		windowTarget.addEventListener('pointercancel', handlePointerCancel);
		windowListenersAttached = true;
	};

	const detachWindowListeners = (): void => {
		if (!windowListenersAttached || !windowTarget) {
			return;
		}

		windowTarget.removeEventListener('pointermove', handleWindowPointerMove);
		windowTarget.removeEventListener('pointerup', handlePointerUp);
		windowTarget.removeEventListener('pointercancel', handlePointerCancel);
		windowListenersAttached = false;
	};

	const attachCanvasListeners = (): void => {
		if (canvasListenersAttached || !canvas || !isEnabled()) {
			return;
		}

		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerCancel);
		canvas.addEventListener('pointerleave', handlePointerLeave);
		canvasListenersAttached = true;
		attachWindowListeners();
	};

	const detachCanvasListeners = (): void => {
		detachWindowListeners();
		if (!canvasListenersAttached || !canvas) {
			return;
		}

		canvas.removeEventListener('pointerdown', handlePointerDown);
		canvas.removeEventListener('pointermove', handlePointerMove);
		canvas.removeEventListener('pointerup', handlePointerUp);
		canvas.removeEventListener('pointercancel', handlePointerCancel);
		canvas.removeEventListener('pointerleave', handlePointerLeave);
		canvasListenersAttached = false;
	};

	const destroy = (): void => {
		detachCanvasListeners();
		resetTracking(false);
		canvas = null;
		windowTarget = null;
	};

	return {
		state,
		lastClick,
		resetClick() {
			lastClick.set(null);
		},
		mount(nextCanvas) {
			if (canvas === nextCanvas) {
				attachCanvasListeners();
				return;
			}

			destroy();
			canvas = nextCanvas;
			windowTarget = nextCanvas.ownerDocument.defaultView;
			attachCanvasListeners();
		},
		updateOptions(nextOptions) {
			const wasEnabled = isEnabled();
			const wasTrackingOutside = shouldTrackOutside();
			options = nextOptions;
			const enabled = isEnabled();
			const trackingOutside = shouldTrackOutside();

			if (wasEnabled && !enabled) {
				detachCanvasListeners();
				resetTracking(true);
				return;
			}
			if (!wasEnabled && enabled) {
				attachCanvasListeners();
				return;
			}
			if (!enabled || wasTrackingOutside === trackingOutside) {
				return;
			}

			if (trackingOutside) {
				attachWindowListeners();
			} else {
				detachWindowListeners();
			}
		},
		destroy
	};
}
