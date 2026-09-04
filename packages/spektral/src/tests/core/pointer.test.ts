import { describe, expect, it } from 'vitest';
import {
	createInitialPointerState,
	getPointerCoordinates,
	normalizePointerKind,
	resolvePointerFrameRequestMode
} from '../../lib/core/pointer.js';

describe('core pointer utilities', () => {
	it('converts client coordinates to px/uv/ndc using shader-friendly y-up space', () => {
		const point = getPointerCoordinates(110, 70, {
			left: 10,
			top: 20,
			width: 200,
			height: 100
		});

		expect(point.inside).toBe(true);
		expect(point.px).toEqual([100, 50]);
		expect(point.uv[0]).toBeCloseTo(0.5, 6);
		expect(point.uv[1]).toBeCloseTo(0.5, 6);
		expect(point.ndc[0]).toBeCloseTo(0, 6);
		expect(point.ndc[1]).toBeCloseTo(0, 6);
	});

	it('marks points outside the canvas rectangle', () => {
		const point = getPointerCoordinates(-20, 50, {
			left: 10,
			top: 20,
			width: 200,
			height: 100
		});

		expect(point.inside).toBe(false);
		expect(point.uv[0]).toBeLessThan(0);
		expect(point.ndc[0]).toBeLessThan(-1);
	});

	it('normalizes unsupported pointer types to mouse', () => {
		expect(normalizePointerKind('mouse')).toBe('mouse');
		expect(normalizePointerKind('pen')).toBe('pen');
		expect(normalizePointerKind('touch')).toBe('touch');
		expect(normalizePointerKind('unknown')).toBe('mouse');
	});

	it('resolves auto frame requests based on render mode', () => {
		expect(resolvePointerFrameRequestMode('auto', 'always')).toBe('none');
		expect(resolvePointerFrameRequestMode('auto', 'on-demand')).toBe('invalidate');
		expect(resolvePointerFrameRequestMode('auto', 'manual')).toBe('advance');
		expect(resolvePointerFrameRequestMode('invalidate', 'always')).toBe('invalidate');
		expect(resolvePointerFrameRequestMode('advance', 'on-demand')).toBe('advance');
		expect(resolvePointerFrameRequestMode('none', 'manual')).toBe('none');
	});

	it('creates predictable initial pointer state', () => {
		const state = createInitialPointerState();
		expect(state.pressed).toBe(false);
		expect(state.dragging).toBe(false);
		expect(state.pointerType).toBeNull();
		expect(state.pointerId).toBeNull();
		expect(state.downPx).toBeNull();
		expect(state.downUv).toBeNull();
		expect(state.deltaPx).toEqual([0, 0]);
		expect(state.deltaUv).toEqual([0, 0]);
		expect(state.velocityPx).toEqual([0, 0]);
		expect(state.velocityUv).toEqual([0, 0]);
	});
});
