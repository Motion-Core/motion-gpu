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
