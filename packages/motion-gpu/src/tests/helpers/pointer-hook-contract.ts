import { describe, expect, it, vi } from 'vitest';
import type { PointerControllerOptions, PointerControllerResult } from '../../lib/core/pointer.js';

export interface PointerHookContractHarness {
	canvas: HTMLCanvasElement;
	pointer: PointerControllerResult;
	unmount: () => Promise<void> | void;
	updateOptions: (options: PointerControllerOptions) => Promise<void> | void;
}

export type MountPointerHookContract = (
	options: PointerControllerOptions
) => Promise<PointerHookContractHarness>;

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
		buttons: init.buttons ?? 0
	});
}

function installPointerCaptureHarness(canvas: HTMLCanvasElement): {
	releasePointerCapture: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
	setPointerCapture: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
} {
	const capturedPointers = new Set<number>();
	const setPointerCapture = vi.fn((pointerId: number) => {
		capturedPointers.add(pointerId);
	});
	const releasePointerCapture = vi.fn((pointerId: number) => {
		capturedPointers.delete(pointerId);
	});

	Object.defineProperties(canvas, {
		setPointerCapture: {
			configurable: true,
			value: setPointerCapture
		},
		releasePointerCapture: {
			configurable: true,
			value: releasePointerCapture
		},
		hasPointerCapture: {
			configurable: true,
			value: (pointerId: number) => capturedPointers.has(pointerId)
		}
	});

	return { releasePointerCapture, setPointerCapture };
}

/**
 * Registers the pointer lifecycle contract shared by all framework adapters.
 */
export function runPointerHookContract(framework: string, mount: MountPointerHookContract): void {
	describe(`${framework} pointer lifecycle contract`, () => {
		it('updates enabled without remounting and fully resets an active pointer', async () => {
			const onMove = vi.fn();
			const harness = await mount({ enabled: false, onMove });
			const capture = installPointerCaptureHarness(harness.canvas);

			harness.canvas.dispatchEvent(createPointer('pointermove', { clientX: 10, clientY: 10 }));
			expect(harness.pointer.state.current.px).toEqual([0, 0]);

			await harness.updateOptions({ enabled: true, onMove });
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 11,
					clientX: 20,
					clientY: 20,
					buttons: 1
				})
			);
			expect(harness.pointer.state.current.pointerId).toBe(11);
			expect(capture.setPointerCapture).toHaveBeenCalledWith(11);

			await harness.updateOptions({ enabled: false, onMove });
			expect(harness.pointer.state.current).toMatchObject({
				inside: false,
				pressed: false,
				dragging: false,
				pointerId: null,
				button: null,
				buttons: 0,
				downPx: null,
				downUv: null
			});
			expect(capture.releasePointerCapture).toHaveBeenCalledWith(11);

			harness.canvas.dispatchEvent(createPointer('pointermove', { clientX: 50, clientY: 50 }));
			expect(harness.pointer.state.current.px).toEqual([20, 20]);
			expect(onMove).not.toHaveBeenCalled();

			await harness.updateOptions({ enabled: true, onMove });
			harness.canvas.dispatchEvent(createPointer('pointermove', { clientX: 60, clientY: 60 }));
			expect(harness.pointer.state.current.px).toEqual([60, 60]);
			expect(onMove).toHaveBeenCalledTimes(1);
			await harness.unmount();
		});

		it('updates outside tracking listeners without remounting', async () => {
			const harness = await mount({
				capturePointer: false,
				trackWhilePressedOutsideCanvas: false
			});
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 12,
					clientX: 20,
					clientY: 20,
					buttons: 1
				})
			);
			window.dispatchEvent(
				createPointer('pointermove', {
					pointerId: 12,
					clientX: 120,
					clientY: 20,
					buttons: 1
				})
			);
			expect(harness.pointer.state.current.px).toEqual([20, 20]);

			await harness.updateOptions({
				capturePointer: false,
				trackWhilePressedOutsideCanvas: true
			});
			window.dispatchEvent(
				createPointer('pointermove', {
					pointerId: 12,
					clientX: 130,
					clientY: 20,
					buttons: 1
				})
			);
			expect(harness.pointer.state.current).toMatchObject({
				px: [130, 20],
				inside: false,
				pressed: true
			});

			await harness.updateOptions({
				capturePointer: false,
				trackWhilePressedOutsideCanvas: false
			});
			window.dispatchEvent(
				createPointer('pointermove', {
					pointerId: 12,
					clientX: 140,
					clientY: 20,
					buttons: 1
				})
			);
			expect(harness.pointer.state.current.px).toEqual([130, 20]);

			window.dispatchEvent(
				createPointer('pointerup', {
					pointerId: 12,
					clientX: 140,
					clientY: 20,
					buttons: 0
				})
			);
			expect(harness.pointer.state.current).toMatchObject({
				px: [140, 20],
				inside: false,
				pressed: false,
				pointerId: null,
				buttons: 0
			});

			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 13,
					clientX: 30,
					clientY: 30,
					buttons: 1
				})
			);
			expect(harness.pointer.state.current).toMatchObject({
				pressed: true,
				pointerId: 13
			});

			window.dispatchEvent(
				createPointer('pointercancel', {
					pointerId: 13,
					clientX: 140,
					clientY: 30
				})
			);
			expect(harness.pointer.state.current).toMatchObject({
				pressed: false,
				pointerId: null
			});
			await harness.unmount();
		});

		it('keeps the first pointer active until its own release', async () => {
			const harness = await mount({});
			const capture = installPointerCaptureHarness(harness.canvas);
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 21,
					clientX: 10,
					clientY: 10,
					buttons: 1
				})
			);
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 22,
					clientX: 80,
					clientY: 80,
					buttons: 1
				})
			);
			expect(harness.pointer.state.current).toMatchObject({
				pointerId: 21,
				px: [10, 10],
				pressed: true
			});
			expect(capture.setPointerCapture).toHaveBeenCalledTimes(1);

			harness.canvas.dispatchEvent(
				createPointer('pointerup', {
					pointerId: 22,
					clientX: 80,
					clientY: 80
				})
			);
			expect(harness.pointer.state.current.pointerId).toBe(21);

			harness.canvas.dispatchEvent(
				createPointer('pointercancel', {
					pointerId: 21,
					clientX: 12,
					clientY: 12
				})
			);
			expect(harness.pointer.state.current.pointerId).toBeNull();
			expect(capture.releasePointerCapture).toHaveBeenCalledWith(21);
			await harness.unmount();
		});

		it('handles a bubbling outside canvas move only once', async () => {
			const onMove = vi.fn();
			const harness = await mount({ onMove });
			installPointerCaptureHarness(harness.canvas);
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 25,
					clientX: 20,
					clientY: 20,
					buttons: 1
				})
			);

			harness.canvas.dispatchEvent(
				createPointer('pointermove', {
					pointerId: 25,
					clientX: 140,
					clientY: 20,
					buttons: 1
				})
			);

			expect(onMove).toHaveBeenCalledTimes(1);
			expect(harness.pointer.state.current).toMatchObject({
				px: [140, 20],
				inside: false,
				pressed: true,
				dragging: true
			});
			await harness.unmount();
		});

		it('releases capture and removes canvas/window listeners on unmount', async () => {
			const onDown = vi.fn();
			const onMove = vi.fn();
			const onUp = vi.fn();
			const harness = await mount({ onDown, onMove, onUp });
			const capture = installPointerCaptureHarness(harness.canvas);
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 31,
					clientX: 20,
					clientY: 20,
					buttons: 1
				})
			);
			window.dispatchEvent(
				createPointer('pointermove', {
					pointerId: 31,
					clientX: 120,
					clientY: 20,
					buttons: 1
				})
			);
			expect(onDown).toHaveBeenCalledTimes(1);
			expect(onMove).toHaveBeenCalledTimes(1);

			await harness.unmount();
			expect(capture.releasePointerCapture).toHaveBeenCalledWith(31);
			expect(harness.pointer.state.current).toMatchObject({
				inside: false,
				pressed: false,
				pointerId: null
			});

			const stateAfterUnmount = harness.pointer.state.current;
			harness.canvas.dispatchEvent(
				createPointer('pointerdown', {
					pointerId: 32,
					clientX: 40,
					clientY: 40,
					buttons: 1
				})
			);
			window.dispatchEvent(
				createPointer('pointermove', {
					pointerId: 31,
					clientX: 150,
					clientY: 20,
					buttons: 1
				})
			);
			window.dispatchEvent(
				createPointer('pointerup', { pointerId: 31, clientX: 150, clientY: 20 })
			);
			expect(harness.pointer.state.current).toBe(stateAfterUnmount);
			expect(onDown).toHaveBeenCalledTimes(1);
			expect(onMove).toHaveBeenCalledTimes(1);
			expect(onUp).not.toHaveBeenCalled();
		});
	});
}
