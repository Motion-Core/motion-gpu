import { cleanup, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineMaterial } from '../lib/core/material.js';
import FragCanvas from '../lib/vue/FragCanvas.vue';
import type { MotionGPUContext } from '../lib/vue/motiongpu-context.js';
import { useMotionGPU } from '../lib/vue/motiongpu-context.js';

const { createRendererMock } = vi.hoisted(() => ({
	createRendererMock: vi.fn()
}));

vi.mock('../lib/core/renderer', () => ({
	createRenderer: createRendererMock
}));

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.35, 1.0);
}
`
});

interface MockRenderer {
	render: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
}

let rafQueue: FrameRequestCallback[] = [];

async function flushFrame(timestamp: number): Promise<void> {
	const callback = rafQueue.shift();
	if (!callback) {
		throw new Error('No queued animation frame callback');
	}

	callback(timestamp);
	await Promise.resolve();
	await Promise.resolve();
}

const MotionGPUProbe = defineComponent({
	name: 'MotionGPUProbe',
	props: {
		onProbe: {
			type: Function as PropType<(value: MotionGPUContext) => void>,
			required: true
		}
	},
	setup(props) {
		const context = useMotionGPU();
		onMounted(() => {
			props.onProbe(context);
		});
		return () => null;
	}
});

const MotionGPUHarness = defineComponent({
	name: 'MotionGPUHarness',
	props: {
		onProbe: {
			type: Function as PropType<(value: MotionGPUContext) => void>,
			required: true
		}
	},
	setup(props) {
		return () =>
			h(
				FragCanvas,
				{
					material,
					showErrorOverlay: false
				},
				{
					default: () => h(MotionGPUProbe, { onProbe: props.onProbe })
				}
			);
	}
});

describe('vue useMotionGPU', () => {
	beforeEach(() => {
		rafQueue = [];
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: FrameRequestCallback) => {
				rafQueue.push(callback);
				return rafQueue.length;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		createRendererMock.mockReset();
		createRendererMock.mockResolvedValue({
			render: vi.fn(),
			destroy: vi.fn()
		} satisfies MockRenderer);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('throws when used outside <FragCanvas>', () => {
		const OutsideProbe = defineComponent({
			name: 'OutsideProbe',
			setup() {
				useMotionGPU();
				return () => null;
			}
		});

		expect(() => render(OutsideProbe)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('provides runtime context inside <FragCanvas>', async () => {
		const onProbe = vi.fn();
		render(MotionGPUHarness, {
			props: {
				onProbe
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const context = onProbe.mock.calls[0]?.[0] as MotionGPUContext;
		expect(context.canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(context.size.current.width).toBeGreaterThanOrEqual(0);
		expect(context.size.current.height).toBeGreaterThanOrEqual(0);

		expect(context.renderMode.current).toBe('always');
		context.renderMode.set('manual');
		expect(context.renderMode.current).toBe('manual');

		expect(context.autoRender.current).toBe(true);
		context.autoRender.set(false);
		expect(context.autoRender.current).toBe(false);

		expect(context.maxDelta.current).toBe(0.1);
		context.maxDelta.set(0.05);
		expect(context.maxDelta.current).toBe(0.05);

		expect(context.user.current).toEqual({});
		context.user.set({ plugin: { enabled: true } });
		expect(context.user.current).toEqual({ plugin: { enabled: true } });

		const createdStage = context.scheduler.createStage('post');
		expect(createdStage.key).toBe('post');
		expect(context.scheduler.getStage('post')?.key).toBe('post');

		context.scheduler.setDiagnosticsEnabled(true);
		expect(context.scheduler.getDiagnosticsEnabled()).toBe(true);
		expect(context.scheduler.getSchedule().stages.length).toBeGreaterThan(0);
		context.scheduler.setProfilingEnabled(true);
		expect(context.scheduler.getProfilingEnabled()).toBe(true);
		context.scheduler.setProfilingWindow(4);
		expect(context.scheduler.getProfilingWindow()).toBe(4);
		expect(context.scheduler.getProfilingSnapshot()).not.toBeNull();
		context.scheduler.resetProfiling();
	});
});
