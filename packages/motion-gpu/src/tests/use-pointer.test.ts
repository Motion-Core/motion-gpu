import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { UsePointerOptions, UsePointerResult } from '../lib/svelte/use-pointer.js';
import PointerOutside from './fixtures/PointerOutside.svelte';
import PointerProviderProbe from './fixtures/PointerProviderProbe.svelte';

interface PointerProbePayload {
	pointer: UsePointerResult;
}

/**
 * Creates a synthetic pointer event with consistent defaults for tests.
 */
function createPointer(
	type: string,
	init: Partial<PointerEventInit> & { pointerId?: number; pointerType?: string } = {}
): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		pointerId: init.pointerId ?? 1,
		pointerType: init.pointerType ?? 'mouse',
		clientX: init.clientX ?? 0,
		clientY: init.clientY ?? 0,
		button: init.button ?? 0,
		buttons: init.buttons ?? 0,
		altKey: init.altKey ?? false,
		ctrlKey: init.ctrlKey ?? false,
		shiftKey: init.shiftKey ?? false,
		metaKey: init.metaKey ?? false
	});
}

/**
 * Returns pointer hook payload from probe callback spy.
 */
function getProbePayload(spy: ReturnType<typeof vi.fn>): PointerProbePayload {
	const payload = spy.mock.calls[0]?.[0] as PointerProbePayload | undefined;
	if (!payload) {
		throw new Error('Expected pointer probe payload');
	}

	return payload;
}

/**
 * Renders pointer probe fixture with default canvas bounds and optional pointer options.
 */
async function renderPointerProbe(
	input: {
		canvas?: HTMLCanvasElement;
		pointerOptions?: UsePointerOptions;
		props?: Record<string, unknown>;
	} = {}
): Promise<{ canvas: HTMLCanvasElement; payload: PointerProbePayload }> {
	const onProbe = vi.fn();
	const canvas = input.canvas ?? document.createElement('canvas');
	canvas.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 100
		}) as DOMRect;
	render(PointerProviderProbe, {
		props: {
			canvas,
			onProbe,
			...(input.pointerOptions === undefined ? {} : { pointerOptions: input.pointerOptions }),
			...(input.props ?? {})
		}
	});

	await waitFor(() => {
		expect(onProbe).toHaveBeenCalledTimes(1);
	});

	return { canvas, payload: getProbePayload(onProbe) };
}

describe('usePointer (svelte)', () => {
	it('throws when used outside <FragCanvas>', () => {
		expect(() => render(PointerOutside)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('tracks pointer movement and exposes normalized coordinates', async () => {
		const onProbe = vi.fn();
		const canvas = document.createElement('canvas');
		canvas.getBoundingClientRect = () =>
			({
				left: 10,
				top: 20,
				width: 200,
				height: 100
			}) as DOMRect;
		render(PointerProviderProbe, {
			props: {
				canvas,
				onProbe
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const payload = getProbePayload(onProbe);
		canvas.dispatchEvent(createPointer('pointermove', { clientX: 110, clientY: 70, buttons: 0 }));

		const state = payload.pointer.state.current;
		expect(state.inside).toBe(true);
		expect(state.px).toEqual([100, 50]);
		expect(state.uv[0]).toBeCloseTo(0.5, 6);
		expect(state.uv[1]).toBeCloseTo(0.5, 6);
		expect(state.ndc[0]).toBeCloseTo(0, 6);
		expect(state.ndc[1]).toBeCloseTo(0, 6);
		expect(state.pressed).toBe(false);
	});

	it('synthesizes click payload and supports resetClick()', async () => {
		const { canvas, payload } = await renderPointerProbe();
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 40, clientY: 60, buttons: 1 }));
		canvas.dispatchEvent(createPointer('pointerup', { clientX: 42, clientY: 61, buttons: 0 }));

		const click = payload.pointer.lastClick.current;
		expect(click).not.toBeNull();
		expect(click?.id).toBe(1);
		expect(click?.px).toEqual([42, 61]);
		expect(click?.uv[0]).toBeCloseTo(0.42, 6);
		expect(click?.uv[1]).toBeCloseTo(0.39, 6);

		payload.pointer.resetClick();
		expect(payload.pointer.lastClick.current).toBeNull();
	});

	it('does not synthesize click when pointer travel exceeds threshold', async () => {
		const { canvas, payload } = await renderPointerProbe();
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 20, clientY: 20, buttons: 1 }));
		canvas.dispatchEvent(createPointer('pointermove', { clientX: 90, clientY: 20, buttons: 1 }));
		canvas.dispatchEvent(createPointer('pointerup', { clientX: 90, clientY: 20, buttons: 0 }));

		expect(payload.pointer.state.current.dragging).toBe(false);
		expect(payload.pointer.lastClick.current).toBeNull();
	});

	it('tracks pointer movement outside canvas while pressed by default', async () => {
		const { canvas, payload } = await renderPointerProbe();
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 20, clientY: 20, buttons: 1 }));
		window.dispatchEvent(createPointer('pointermove', { clientX: 140, clientY: 20, buttons: 1 }));

		expect(payload.pointer.state.current.pressed).toBe(true);
		expect(payload.pointer.state.current.inside).toBe(false);
		expect(payload.pointer.state.current.dragging).toBe(true);
	});

	it('does not track outside movement when trackWhilePressedOutsideCanvas=false', async () => {
		const { canvas, payload } = await renderPointerProbe({
			pointerOptions: {
				trackWhilePressedOutsideCanvas: false
			}
		});
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 20, clientY: 20, buttons: 1 }));
		window.dispatchEvent(createPointer('pointermove', { clientX: 140, clientY: 20, buttons: 1 }));

		expect(payload.pointer.state.current.pressed).toBe(true);
		expect(payload.pointer.state.current.inside).toBe(true);
		expect(payload.pointer.state.current.px).toEqual([20, 20]);
	});

	it('supports clickButtons filtering and clickEnabled=false', async () => {
		const rightClickProbe = await renderPointerProbe({
			pointerOptions: {
				clickButtons: [2]
			}
		});
		rightClickProbe.canvas.dispatchEvent(
			createPointer('pointerdown', {
				pointerId: 1,
				clientX: 30,
				clientY: 30,
				button: 0,
				buttons: 1
			})
		);
		rightClickProbe.canvas.dispatchEvent(
			createPointer('pointerup', { pointerId: 1, clientX: 30, clientY: 30, button: 0, buttons: 0 })
		);
		expect(rightClickProbe.payload.pointer.lastClick.current).toBeNull();

		rightClickProbe.canvas.dispatchEvent(
			createPointer('pointerdown', {
				pointerId: 2,
				clientX: 30,
				clientY: 30,
				button: 2,
				buttons: 2
			})
		);
		rightClickProbe.canvas.dispatchEvent(
			createPointer('pointerup', { pointerId: 2, clientX: 30, clientY: 30, button: 2, buttons: 0 })
		);
		expect(rightClickProbe.payload.pointer.lastClick.current?.button).toBe(2);

		const disabledClickProbe = await renderPointerProbe({
			pointerOptions: {
				clickEnabled: false
			}
		});
		disabledClickProbe.canvas.dispatchEvent(
			createPointer('pointerdown', { pointerId: 3, clientX: 40, clientY: 40, buttons: 1 })
		);
		disabledClickProbe.canvas.dispatchEvent(
			createPointer('pointerup', { pointerId: 3, clientX: 40, clientY: 40, buttons: 0 })
		);
		expect(disabledClickProbe.payload.pointer.lastClick.current).toBeNull();
	});

	it('invokes onDown/onMove/onUp/onClick callbacks with normalized payloads', async () => {
		const onDown = vi.fn();
		const onMove = vi.fn();
		const onUp = vi.fn();
		const onClick = vi.fn();
		const { canvas } = await renderPointerProbe({
			pointerOptions: {
				onDown,
				onMove,
				onUp,
				onClick
			}
		});
		canvas.dispatchEvent(
			createPointer('pointerdown', {
				clientX: 20,
				clientY: 20,
				button: 0,
				buttons: 1,
				pointerType: 'touch'
			})
		);
		canvas.dispatchEvent(
			createPointer('pointermove', {
				clientX: 25,
				clientY: 24,
				button: 0,
				buttons: 1,
				pointerType: 'touch'
			})
		);
		canvas.dispatchEvent(
			createPointer('pointerup', {
				clientX: 26,
				clientY: 25,
				button: 0,
				buttons: 0,
				pointerType: 'touch',
				altKey: true
			})
		);

		expect(onDown).toHaveBeenCalledTimes(1);
		expect(onMove).toHaveBeenCalledTimes(1);
		expect(onUp).toHaveBeenCalledTimes(1);
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onDown.mock.calls[0]?.[0]?.pressed).toBe(true);
		expect(onUp.mock.calls[0]?.[0]?.pressed).toBe(false);
		expect(onClick.mock.calls[0]?.[0]?.pointerType).toBe('touch');
		expect(onClick.mock.calls[0]?.[0]?.modifiers.alt).toBe(true);
		expect(onClick.mock.calls[0]?.[1]?.pressed).toBe(false);
		expect(onClick.mock.calls[0]?.[1]?.pointerId).toBeNull();
		expect(onClick.mock.calls[0]?.[2]?.type).toBe('pointerup');
	});

	it('releases active pointer on pointercancel without synthesizing click', async () => {
		const onUp = vi.fn();
		const onClick = vi.fn();
		const { canvas, payload } = await renderPointerProbe({
			pointerOptions: {
				onUp,
				onClick
			}
		});
		canvas.dispatchEvent(
			createPointer('pointerdown', { pointerId: 7, clientX: 30, clientY: 30, buttons: 1 })
		);
		canvas.dispatchEvent(
			createPointer('pointercancel', { pointerId: 7, clientX: 32, clientY: 32, buttons: 0 })
		);

		expect(payload.pointer.state.current.pressed).toBe(false);
		expect(payload.pointer.state.current.pointerId).toBeNull();
		expect(payload.pointer.lastClick.current).toBeNull();
		expect(onUp).toHaveBeenCalledTimes(1);
		expect(onClick).not.toHaveBeenCalled();
	});

	it('ignores events from non-active pointers while tracking an active pointer', async () => {
		const { canvas, payload } = await renderPointerProbe();
		canvas.dispatchEvent(
			createPointer('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, buttons: 1 })
		);
		expect(payload.pointer.state.current.px).toEqual([10, 10]);

		canvas.dispatchEvent(
			createPointer('pointermove', { pointerId: 2, clientX: 80, clientY: 80, buttons: 1 })
		);
		expect(payload.pointer.state.current.px).toEqual([10, 10]);

		canvas.dispatchEvent(
			createPointer('pointermove', { pointerId: 1, clientX: 30, clientY: 30, buttons: 1 })
		);
		expect(payload.pointer.state.current.px).toEqual([30, 30]);
	});

	it('uses invalidate() in on-demand mode and advance() in manual mode when requestFrame=auto', async () => {
		const onProbeOnDemand = vi.fn();
		const onProbeManual = vi.fn();
		const invalidateSpy = vi.fn();
		const advanceSpy = vi.fn();
		const canvasOnDemand = document.createElement('canvas');
		canvasOnDemand.getBoundingClientRect = () =>
			({
				left: 0,
				top: 0,
				width: 100,
				height: 100
			}) as DOMRect;
		const canvasManual = document.createElement('canvas');
		canvasManual.getBoundingClientRect = () =>
			({
				left: 0,
				top: 0,
				width: 100,
				height: 100
			}) as DOMRect;

		render(PointerProviderProbe, {
			props: {
				canvas: canvasOnDemand,
				onProbe: onProbeOnDemand,
				renderMode: 'on-demand',
				invalidateSpy
			}
		});
		render(PointerProviderProbe, {
			props: {
				canvas: canvasManual,
				onProbe: onProbeManual,
				renderMode: 'manual',
				advanceSpy
			}
		});

		await waitFor(() => {
			expect(onProbeOnDemand).toHaveBeenCalledTimes(1);
			expect(onProbeManual).toHaveBeenCalledTimes(1);
		});

		canvasOnDemand.dispatchEvent(
			createPointer('pointermove', { clientX: 10, clientY: 10, buttons: 0 })
		);
		canvasManual.dispatchEvent(
			createPointer('pointermove', { clientX: 10, clientY: 10, buttons: 0 })
		);

		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		expect(advanceSpy).toHaveBeenCalledTimes(1);
	});
});
