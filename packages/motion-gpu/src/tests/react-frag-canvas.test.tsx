import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { defineMaterial } from '../lib/core/material.js';
import type { MotionGPUContext } from '../lib/react/motiongpu-context.js';
import { useMotionGPU } from '../lib/react/motiongpu-context.js';
import { FragCanvas } from '../lib/react/FragCanvas.js';

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

function MotionGPUProbe({ onProbe }: { onProbe: (value: MotionGPUContext) => void }) {
	const context = useMotionGPU();

	useEffect(() => {
		onProbe(context);
	}, [context, onProbe]);

	return null;
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

	it('shows a readable overlay error and calls onError when WebGPU is unavailable', async () => {
		const onError = vi.fn();
		render(<FragCanvas material={material} onError={onError} />);

		await flushFrame(16);
		const error = await screen.findByTestId('motiongpu-error');
		expect(error.textContent).toContain('WebGPU unavailable');
		expect(error.textContent).toContain('WebGPU is not available');

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					title: 'WebGPU unavailable'
				})
			);
		});
	});

	it('supports custom error renderer', async () => {
		render(
			<FragCanvas
				material={material}
				errorRenderer={(report) => <div data-testid="custom-error">{report.phase}</div>}
			/>
		);

		await flushFrame(16);
		const custom = await screen.findByTestId('custom-error');
		expect(custom.textContent).toContain('initialization');
		expect(screen.queryByTestId('motiongpu-error')).toBeNull();
	});

	it('provides runtime context inside <FragCanvas>', async () => {
		const onProbe = vi.fn();
		render(
			<FragCanvas material={material} showErrorOverlay={false}>
				<MotionGPUProbe onProbe={onProbe} />
			</FragCanvas>
		);

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});
		const context = onProbe.mock.calls[0]?.[0] as MotionGPUContext;
		expect(context.canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(context.renderMode.current).toBe('always');
		expect(context.autoRender.current).toBe(true);
	});

	it('rebuilds renderer when outputColorSpace changes', async () => {
		const created: Array<{ renderer: MockRenderer; options: { outputColorSpace: string } }> = [];
		createRendererMock.mockImplementation(async (options: { outputColorSpace: string }) => {
			const renderer: MockRenderer = {
				render: vi.fn(),
				destroy: vi.fn()
			};
			created.push({ renderer, options });
			return renderer;
		});

		const view = render(
			<FragCanvas material={material} showErrorOverlay={false} outputColorSpace="srgb" />
		);

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});

		await flushFrame(32);
		await waitFor(() => {
			expect(created[0]?.renderer.render).toHaveBeenCalled();
		});

		await view.rerender(
			<FragCanvas material={material} showErrorOverlay={false} outputColorSpace="linear" />
		);
		await flushFrame(48);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});
		expect(created[1]?.options.outputColorSpace).toBe('linear');
		expect(created[0]?.renderer.destroy).toHaveBeenCalledTimes(1);
	});
});
