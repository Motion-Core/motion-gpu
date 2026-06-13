import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineMaterial } from '../lib/core/material.js';
import { FragCanvas, type FragCanvasProps } from '../lib/react/FragCanvas.js';

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

describe('React FragCanvas', () => {
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
		render(
			<FragCanvas
				material={material}
				adapterOptions={{ powerPreference: 'high-performance' }}
				deviceDescriptor={{ label: 'motiongpu-test-device' }}
			/>
		);

		await flushFrame(16);
		const error = await screen.findByTestId('motiongpu-error');
		expect(error.textContent).toContain('WebGPU unavailable');
		expect(error.textContent).toContain('WebGPU is not available');
		expect(error.textContent).toContain('Use a browser with WebGPU enabled');
	});

	it('calls onError callback with normalized report data', async () => {
		const onError = vi.fn();
		render(<FragCanvas material={material} onError={onError} />);

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
		render(<FragCanvas material={material} showErrorOverlay={false} onError={onError} />);

		await flushFrame(16);
		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('renders custom error renderer when provided and keeps onError callback', async () => {
		const onError = vi.fn();
		render(
			<FragCanvas
				material={material}
				onError={onError}
				errorRenderer={(report) => (
					<div data-testid="custom-error-renderer">
						{report.title} :: {report.phase}
					</div>
				)}
			/>
		);

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
		render(
			<FragCanvas
				material={material}
				onError={onError}
				showErrorOverlay={false}
				errorRenderer={(report) => (
					<div data-testid="custom-error-renderer">
						{report.title} :: {report.phase}
					</div>
				)}
			/>
		);

		await flushFrame(16);
		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});
		expect(screen.queryByTestId('custom-error-renderer')).toBeNull();
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('forwards native canvas props to the internal canvas', () => {
		const onClick = vi.fn();
		const view = render(
			<FragCanvas
				material={material}
				showErrorOverlay={false}
				className="gpu-canvas"
				style={{ opacity: 0.5 }}
				id="gpu-canvas"
				data-testid="gpu-canvas"
				aria-label="GPU canvas"
				tabIndex={0}
				onClick={onClick}
			/>
		);

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
		const blockedProps = {
			material,
			showErrorOverlay: false,
			width: 640,
			height: 480
		} as unknown as FragCanvasProps;
		const view = render(<FragCanvas {...blockedProps} />);
		const canvas = view.container.querySelector<HTMLCanvasElement>('canvas');

		expect(canvas).toBeTruthy();
		expect(canvas?.hasAttribute('width')).toBe(false);
		expect(canvas?.hasAttribute('height')).toBe(false);
	});

	it('exposes the internal canvas through the React 19 ref prop', () => {
		const canvasRef = createRef<HTMLCanvasElement>();
		const view = render(
			<FragCanvas ref={canvasRef} material={material} showErrorOverlay={false} />
		);
		const canvas = view.container.querySelector<HTMLCanvasElement>('canvas');

		expect(canvas).toBeTruthy();
		expect(canvasRef.current).toBe(canvas);

		view.unmount();
		expect(canvasRef.current).toBeNull();
	});
});
