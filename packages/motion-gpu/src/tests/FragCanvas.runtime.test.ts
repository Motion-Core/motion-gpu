import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FragCanvas from '../lib/FragCanvas.svelte';
import { defineMaterial } from '../lib/core/material';

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

describe('FragCanvas runtime', () => {
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
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
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

		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});

		await flushFrame(32);
		await waitFor(() => {
			expect(created[0]?.renderer.render).toHaveBeenCalled();
		});

		await view.rerender({
			material,
			outputColorSpace: 'linear',
			showErrorOverlay: false
		});
		await flushFrame(48);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});

		expect(created[1]?.options.outputColorSpace).toBe('linear');
		expect(created[0]?.renderer.destroy).toHaveBeenCalledTimes(1);

		await flushFrame(64);
		await waitFor(() => {
			expect(created[1]?.renderer.render).toHaveBeenCalled();
		});
	});

	it('applies retry backoff after renderer initialization failure and recovers', async () => {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);

		const recoveredRenderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockRejectedValueOnce(new Error('bootstrap failed'));
		createRendererMock.mockResolvedValue(recoveredRenderer);

		const onError = vi.fn();
		render(FragCanvas, {
			props: {
				material,
				onError,
				showErrorOverlay: false
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: 'bootstrap failed'
				})
			);
		});

		now = 100;
		await flushFrame(32);
		expect(createRendererMock).toHaveBeenCalledTimes(1);

		now = 300;
		await flushFrame(48);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});

		await flushFrame(64);
		await waitFor(() => {
			expect(recoveredRenderer.render).toHaveBeenCalled();
		});
	});

	it('recovers when material becomes valid after initial initialization error', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);

		const onError = vi.fn();
		const invalidMaterial = {
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: {},
			textures: {},
			defines: {}
		};
		const view = render(FragCanvas, {
			props: {
				material: invalidMaterial as unknown as typeof material,
				onError,
				showErrorOverlay: false
			}
		});

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: expect.stringContaining('Invalid material instance')
				})
			);
		});
		expect(createRendererMock).not.toHaveBeenCalled();

		await view.rerender({
			material,
			onError,
			showErrorOverlay: false
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});
		await flushFrame(32);
		await waitFor(() => {
			expect(renderer.render).toHaveBeenCalled();
		});
	});
});
