import { cleanup, render, screen, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, ref, type PropType } from 'vue';
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

const CanvasExposeHarness = defineComponent({
	name: 'VueFragCanvasExposeHarness',
	props: {
		onExpose: {
			type: Function as PropType<
				(canvas: HTMLCanvasElement | undefined, getCanvas: HTMLCanvasElement | undefined) => void
			>,
			required: true
		}
	},
	setup(props) {
		const fragCanvas = ref<{
			readonly canvas?: HTMLCanvasElement;
			getCanvas(): HTMLCanvasElement | undefined;
		} | null>(null);

		onMounted(() => {
			props.onExpose(fragCanvas.value?.canvas, fragCanvas.value?.getCanvas());
		});

		return () =>
			h(FragCanvas, {
				ref: fragCanvas,
				material,
				showErrorOverlay: false,
				'data-testid': 'exposed-canvas'
			});
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

	it('forwards native canvas attrs to the internal canvas', () => {
		const onClick = vi.fn();
		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			},
			attrs: {
				class: 'gpu-canvas',
				style: { opacity: 0.5 },
				id: 'gpu-canvas',
				'data-testid': 'gpu-canvas',
				'aria-label': 'GPU canvas',
				tabindex: 0,
				onClick
			}
		});

		const wrapper = view.container.querySelector<HTMLElement>('.motiongpu-canvas-wrap');
		const canvas = screen.getByTestId('gpu-canvas') as HTMLCanvasElement;

		expect(wrapper).toBeTruthy();
		expect(canvas).toBeTruthy();
		expect(wrapper?.id).toBe('');
		expect(wrapper?.classList.contains('gpu-canvas')).toBe(false);
		expect(wrapper?.style.position).toBe('relative');
		expect(wrapper?.style.width).toBe('100%');
		expect(wrapper?.style.height).toBe('100%');
		expect(wrapper?.style.overflow).toBe('hidden');

		expect(canvas?.style.position).toBe('absolute');
		expect(canvas?.style.width).toBe('100%');
		expect(canvas?.style.height).toBe('100%');
		expect(canvas?.style.display).toBe('block');
		expect(canvas?.style.opacity).toBe('0.5');
		expect(canvas.id).toBe('gpu-canvas');
		expect(canvas.classList.contains('gpu-canvas')).toBe(true);
		expect(canvas.getAttribute('aria-label')).toBe('GPU canvas');
		expect(canvas.tabIndex).toBe(0);

		canvas.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('does not forward native canvas width and height attributes', () => {
		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			},
			attrs: {
				width: 640,
				height: 480
			}
		});

		const canvas = view.container.querySelector<HTMLCanvasElement>('canvas');

		expect(canvas).toBeTruthy();
		expect(canvas?.hasAttribute('width')).toBe(false);
		expect(canvas?.hasAttribute('height')).toBe(false);
	});

	it('exposes the internal canvas through the component public instance', async () => {
		const onExpose = vi.fn();
		render(CanvasExposeHarness, {
			props: {
				onExpose
			}
		});

		const canvas = await screen.findByTestId('exposed-canvas');
		await waitFor(() => {
			expect(onExpose).toHaveBeenCalledWith(canvas, canvas);
		});
	});
});
