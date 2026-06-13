import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FragCanvas from '../lib/svelte/FragCanvas.svelte';
import { defineMaterial } from '../lib/core/material';
import FragCanvasCanvasBindingHarness from './fixtures/FragCanvasCanvasBindingHarness.svelte';
import FragCanvasCustomErrorRendererHarness from './fixtures/FragCanvasCustomErrorRendererHarness.svelte';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.5, 1.0);
}
`
});

describe('FragCanvas', () => {
	afterEach(() => {
		cleanup();
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

		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('renders custom error renderer when provided and keeps onError callback', async () => {
		const onError = vi.fn();
		render(FragCanvasCustomErrorRendererHarness, {
			props: {
				material,
				onError
			}
		});

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
		render(FragCanvasCustomErrorRendererHarness, {
			props: {
				material,
				showErrorOverlay: false,
				onError
			}
		});

		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(screen.queryByTestId('custom-error-renderer')).toBeNull();
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('forwards native canvas props to the internal canvas', () => {
		const onClick = vi.fn();
		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false,
				class: 'gpu-canvas',
				style: 'opacity: 0.5;',
				id: 'gpu-canvas',
				'data-testid': 'gpu-canvas',
				'aria-label': 'GPU canvas',
				tabindex: 0,
				onclick: onClick
			}
		});

		const wrapper = view.container.querySelector<HTMLElement>('.motiongpu-canvas-wrap');
		const canvas = screen.getByTestId('gpu-canvas') as HTMLCanvasElement;

		expect(wrapper).toBeTruthy();
		expect(wrapper?.id).toBe('');
		expect(wrapper?.classList.contains('gpu-canvas')).toBe(false);
		expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(canvas.id).toBe('gpu-canvas');
		expect(canvas.classList.contains('gpu-canvas')).toBe(true);
		expect(canvas.style.opacity).toBe('0.5');
		expect(canvas.getAttribute('aria-label')).toBe('GPU canvas');
		expect(canvas.tabIndex).toBe(0);

		canvas.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('does not forward native canvas width and height attributes', () => {
		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false,
				width: 640,
				height: 480
			} as never
		});

		const canvas = view.container.querySelector<HTMLCanvasElement>('canvas');

		expect(canvas).toBeTruthy();
		expect(canvas?.hasAttribute('width')).toBe(false);
		expect(canvas?.hasAttribute('height')).toBe(false);
	});

	it('supports binding the internal canvas element', async () => {
		const onCanvas = vi.fn();
		render(FragCanvasCanvasBindingHarness, {
			props: {
				material,
				onCanvas
			}
		});

		const canvas = await screen.findByTestId('bound-canvas');
		await waitFor(() => {
			expect(onCanvas).toHaveBeenLastCalledWith(canvas);
		});
	});
});
