import { cleanup, render, screen, waitFor } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineMaterial } from '../lib/core/material.js';
import FragCanvas from '../lib/vue/FragCanvas.vue';
import type { MotionGPUErrorReport } from '../lib/core/error-report.js';

const { createRendererMock } = vi.hoisted(() => ({
	createRendererMock: vi.fn()
}));

vi.mock('../lib/core/renderer', () => ({
	createRenderer: createRendererMock
}));

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.5, 1.0);
}
`
});

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

const CustomErrorRendererHarness = defineComponent({
	name: 'VueFragCanvasCustomErrorRendererHarness',
	props: {
		showErrorOverlay: {
			type: Boolean,
			default: true
		},
		onError: {
			type: Function,
			required: false
		}
	},
	setup(props) {
		return () =>
			h(
				FragCanvas,
				{
					material,
					showErrorOverlay: props.showErrorOverlay,
					onError: props.onError as ((report: MotionGPUErrorReport) => void) | undefined
				},
				{
					errorRenderer: ({ report }: { report: MotionGPUErrorReport }) =>
						h(
							'div',
							{ 'data-testid': 'custom-error-renderer' },
							`${report.title} :: ${report.phase}`
						)
				}
			);
	}
});

describe('Vue FragCanvas', () => {
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
		createRendererMock.mockRejectedValue(new Error('WebGPU is not available in this browser'));
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('shows a readable error when WebGPU is unavailable', async () => {
		render(FragCanvas, {
			props: {
				material,
				adapterOptions: { powerPreference: 'high-performance' },
				deviceDescriptor: { label: 'motiongpu-test-device' }
			}
		});

		await flushFrame(16);
		const error = await screen.findByTestId('motiongpu-error');
		expect(error.textContent).toContain('WebGPU unavailable');
		expect(error.textContent).toContain('WebGPU is not available');
		expect(error.textContent).toContain('Use a browser with WebGPU enabled');
	});

	it('calls onError callback with normalized report data', async () => {
		const onError = vi.fn();
		render(FragCanvas, {
			props: {
				material,
				onError
			}
		});

		await flushFrame(16);
		const error = await screen.findByTestId('motiongpu-error');
		expect(error).toBeDefined();
		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'WebGPU unavailable',
				phase: 'initialization'
			})
		);
	});

	it('can disable the built-in error overlay while still reporting errors', async () => {
		const onError = vi.fn();
		render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false,
				onError
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('renders custom error renderer when provided and keeps onError callback', async () => {
		const onError = vi.fn();
		render(CustomErrorRendererHarness, {
			props: {
				onError
			}
		});

		await flushFrame(16);
		const custom = await screen.findByTestId('custom-error-renderer');
		expect(custom.textContent).toContain('WebGPU unavailable');
		expect(custom.textContent).toContain('initialization');
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'WebGPU unavailable',
					phase: 'initialization'
				})
			);
		});
	});

	it('does not render custom error renderer when showErrorOverlay is disabled', async () => {
		const onError = vi.fn();
		render(CustomErrorRendererHarness, {
			props: {
				showErrorOverlay: false,
				onError
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(screen.queryByTestId('custom-error-renderer')).toBeNull();
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('applies layout-safe inline styles to wrapper and canvas', () => {
		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false,
				canvasStyle: { opacity: 0.5 }
			}
		});

		const wrapper = view.container.querySelector<HTMLElement>('.motiongpu-canvas-wrap');
		const canvas = view.container.querySelector<HTMLCanvasElement>('canvas');

		expect(wrapper).toBeTruthy();
		expect(canvas).toBeTruthy();
		expect(wrapper?.style.position).toBe('relative');
		expect(wrapper?.style.width).toBe('100%');
		expect(wrapper?.style.height).toBe('100%');
		expect(wrapper?.style.overflow).toBe('hidden');

		expect(canvas?.style.position).toBe('absolute');
		expect(canvas?.style.width).toBe('100%');
		expect(canvas?.style.height).toBe('100%');
		expect(canvas?.style.display).toBe('block');
		expect(canvas?.style.opacity).toBe('0.5');
	});
});
