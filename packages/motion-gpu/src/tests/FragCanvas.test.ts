import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FragCanvas from '../lib/FragCanvas.svelte';
import { defineMaterial } from '../lib/core/material';

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
});
