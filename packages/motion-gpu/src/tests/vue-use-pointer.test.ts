import { render, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createCurrentWritable } from '../lib/core/current-value.js';
import { createFrameRegistry } from '../lib/core/frame-registry.js';
import type { MotionGPUContext } from '../lib/vue/motiongpu-context.js';
import { provideMotionGPUContext } from '../lib/vue/motiongpu-context.js';
import {
	usePointer,
	type UsePointerOptions,
	type UsePointerResult
} from '../lib/vue/use-pointer.js';

interface PointerProbePayload {
	pointer: UsePointerResult;
}

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

function createRuntimeHarness(input: {
	advanceSpy?: () => void;
	canvas: HTMLCanvasElement;
	invalidateSpy?: () => void;
	renderMode?: 'always' | 'manual' | 'on-demand';
}): { context: MotionGPUContext } {
	const registry = createFrameRegistry();
	const renderMode = input.renderMode ?? 'always';
	const context: MotionGPUContext = {
		canvas: input.canvas,
		size: createCurrentWritable({ width: 0, height: 0 }),
		dpr: createCurrentWritable(1),
		maxDelta: createCurrentWritable(0.1),
		renderMode: createCurrentWritable(renderMode),
		autoRender: createCurrentWritable(true),
		user: createCurrentWritable<Record<string | symbol, unknown>>({}),
		invalidate: () => {
			input.invalidateSpy?.();
			registry.invalidate();
		},
		advance: () => {
			input.advanceSpy?.();
			registry.advance();
		},
		scheduler: {
			createStage: registry.createStage,
			getStage: registry.getStage,
			setDiagnosticsEnabled: registry.setDiagnosticsEnabled,
			getDiagnosticsEnabled: registry.getDiagnosticsEnabled,
			getLastRunTimings: registry.getLastRunTimings,
			getSchedule: registry.getSchedule,
			setProfilingEnabled: registry.setProfilingEnabled,
			setProfilingWindow: registry.setProfilingWindow,
			resetProfiling: registry.resetProfiling,
			getProfilingEnabled: registry.getProfilingEnabled,
			getProfilingWindow: registry.getProfilingWindow,
			getProfilingSnapshot: registry.getProfilingSnapshot
		}
	};

	return { context };
}

const PointerProbe = defineComponent({
	name: 'VuePointerProbe',
	props: {
		onProbe: {
			type: Function as PropType<(value: PointerProbePayload) => void>,
			required: true
		},
		options: {
			type: Object as PropType<UsePointerOptions>,
			default: () => ({})
		}
	},
	setup(props) {
		const pointer = usePointer(props.options);
		onMounted(() => {
			props.onProbe({ pointer });
		});
		return () => null;
	}
});

const MotionGPUProvider = defineComponent({
	name: 'VueMotionGPUProvider',
	props: {
		payload: {
			type: Object as PropType<{ context: MotionGPUContext }>,
			required: true
		},
		child: {
			type: Object as PropType<ReturnType<typeof defineComponent>>,
			required: true
		},
		childProps: {
			type: Object as PropType<Record<string, unknown>>,
			default: () => ({})
		}
	},
	setup(props) {
		provideMotionGPUContext(props.payload.context);
		return () => h(props.child, props.childProps);
	}
});

async function renderPointerProbe(
	input: {
		options?: UsePointerOptions;
		renderMode?: 'always' | 'manual' | 'on-demand';
		spies?: {
			advanceSpy?: () => void;
			invalidateSpy?: () => void;
		};
	} = {}
): Promise<{ canvas: HTMLCanvasElement; probe: PointerProbePayload }> {
	const onProbe = vi.fn();
	const canvas = document.createElement('canvas');
	canvas.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 100
		}) as DOMRect;

	render(MotionGPUProvider, {
		props: {
			payload: createRuntimeHarness({
				canvas,
				renderMode: input.renderMode,
				advanceSpy: input.spies?.advanceSpy,
				invalidateSpy: input.spies?.invalidateSpy
			}),
			child: PointerProbe,
			childProps: {
				onProbe,
				options: input.options
			}
		}
	});

	await waitFor(() => {
		expect(onProbe).toHaveBeenCalledTimes(1);
	});

	const probe = onProbe.mock.calls[0]?.[0] as PointerProbePayload | undefined;
	if (!probe) {
		throw new Error('Expected pointer probe payload');
	}

	return { canvas, probe };
}

describe('vue usePointer', () => {
	it('throws when used outside <FragCanvas>', () => {
		const OutsideProbe = defineComponent({
			name: 'OutsidePointerProbe',
			setup() {
				usePointer();
				return () => null;
			}
		});

		expect(() => render(OutsideProbe)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
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
		const payload = createRuntimeHarness({ canvas });
		render(MotionGPUProvider, {
			props: {
				payload,
				child: PointerProbe,
				childProps: { onProbe }
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const probe = onProbe.mock.calls[0]?.[0] as PointerProbePayload;
		canvas.dispatchEvent(createPointer('pointermove', { clientX: 110, clientY: 70, buttons: 0 }));

		const state = probe.pointer.state.current;
		expect(state.inside).toBe(true);
		expect(state.px).toEqual([100, 50]);
		expect(state.uv[0]).toBeCloseTo(0.5, 6);
		expect(state.uv[1]).toBeCloseTo(0.5, 6);
		expect(state.ndc[0]).toBeCloseTo(0, 6);
		expect(state.ndc[1]).toBeCloseTo(0, 6);
	});

	it('synthesizes click payload and supports resetClick()', async () => {
		const { canvas, probe } = await renderPointerProbe();
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 40, clientY: 60, buttons: 1 }));
		canvas.dispatchEvent(createPointer('pointerup', { clientX: 42, clientY: 61, buttons: 0 }));

		const click = probe.pointer.lastClick.current;
		expect(click).not.toBeNull();
		expect(click?.id).toBe(1);
		expect(click?.px).toEqual([42, 61]);
		expect(click?.uv[0]).toBeCloseTo(0.42, 6);
		expect(click?.uv[1]).toBeCloseTo(0.39, 6);

		probe.pointer.resetClick();
		expect(probe.pointer.lastClick.current).toBeNull();
	});

	it('does not synthesize click when pointer travel exceeds threshold', async () => {
		const { canvas, probe } = await renderPointerProbe();
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 10, clientY: 10, buttons: 1 }));
		canvas.dispatchEvent(createPointer('pointermove', { clientX: 90, clientY: 10, buttons: 1 }));
		canvas.dispatchEvent(createPointer('pointerup', { clientX: 90, clientY: 10, buttons: 0 }));

		expect(probe.pointer.lastClick.current).toBeNull();
	});

	it('tracks pointer movement outside canvas while pressed by default', async () => {
		const { canvas, probe } = await renderPointerProbe();
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 20, clientY: 20, buttons: 1 }));
		window.dispatchEvent(createPointer('pointermove', { clientX: 140, clientY: 20, buttons: 1 }));

		expect(probe.pointer.state.current.pressed).toBe(true);
		expect(probe.pointer.state.current.inside).toBe(false);
		expect(probe.pointer.state.current.dragging).toBe(true);
	});

	it('does not track outside movement when trackWhilePressedOutsideCanvas=false', async () => {
		const { canvas, probe } = await renderPointerProbe({
			options: {
				trackWhilePressedOutsideCanvas: false
			}
		});
		canvas.dispatchEvent(createPointer('pointerdown', { clientX: 20, clientY: 20, buttons: 1 }));
		window.dispatchEvent(createPointer('pointermove', { clientX: 140, clientY: 20, buttons: 1 }));

		expect(probe.pointer.state.current.pressed).toBe(true);
		expect(probe.pointer.state.current.inside).toBe(true);
		expect(probe.pointer.state.current.px).toEqual([20, 20]);
	});

	it('supports clickButtons filtering and clickEnabled=false', async () => {
		const rightClickProbe = await renderPointerProbe({
			options: {
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
		expect(rightClickProbe.probe.pointer.lastClick.current).toBeNull();

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
		expect(rightClickProbe.probe.pointer.lastClick.current?.button).toBe(2);

		const disabledClickProbe = await renderPointerProbe({
			options: {
				clickEnabled: false
			}
		});
		disabledClickProbe.canvas.dispatchEvent(
			createPointer('pointerdown', { pointerId: 3, clientX: 40, clientY: 40, buttons: 1 })
		);
		disabledClickProbe.canvas.dispatchEvent(
			createPointer('pointerup', { pointerId: 3, clientX: 40, clientY: 40, buttons: 0 })
		);
		expect(disabledClickProbe.probe.pointer.lastClick.current).toBeNull();
	});

	it('invokes onDown/onMove/onUp/onClick callbacks with normalized payloads', async () => {
		const onDown = vi.fn();
		const onMove = vi.fn();
		const onUp = vi.fn();
		const onClick = vi.fn();
		const { canvas } = await renderPointerProbe({
			options: {
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
		const { canvas, probe } = await renderPointerProbe({
			options: {
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

		expect(probe.pointer.state.current.pressed).toBe(false);
		expect(probe.pointer.state.current.pointerId).toBeNull();
		expect(probe.pointer.lastClick.current).toBeNull();
		expect(onUp).toHaveBeenCalledTimes(1);
		expect(onClick).not.toHaveBeenCalled();
	});

	it('ignores events from non-active pointers while tracking an active pointer', async () => {
		const { canvas, probe } = await renderPointerProbe();
		canvas.dispatchEvent(
			createPointer('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, buttons: 1 })
		);
		expect(probe.pointer.state.current.px).toEqual([10, 10]);

		canvas.dispatchEvent(
			createPointer('pointermove', { pointerId: 2, clientX: 80, clientY: 80, buttons: 1 })
		);
		expect(probe.pointer.state.current.px).toEqual([10, 10]);

		canvas.dispatchEvent(
			createPointer('pointermove', { pointerId: 1, clientX: 30, clientY: 30, buttons: 1 })
		);
		expect(probe.pointer.state.current.px).toEqual([30, 30]);
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

		render(MotionGPUProvider, {
			props: {
				payload: createRuntimeHarness({
					canvas: canvasOnDemand,
					renderMode: 'on-demand',
					invalidateSpy
				}),
				child: PointerProbe,
				childProps: { onProbe: onProbeOnDemand }
			}
		});
		render(MotionGPUProvider, {
			props: {
				payload: createRuntimeHarness({
					canvas: canvasManual,
					renderMode: 'manual',
					advanceSpy
				}),
				child: PointerProbe,
				childProps: { onProbe: onProbeManual }
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
