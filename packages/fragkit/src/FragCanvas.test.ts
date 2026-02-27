import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FragCanvas from './lib/FragCanvas.svelte';
import { createMaterial } from './lib/core/material';

const material = createMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.5, 1.0);
}
`
});

describe('FragCanvas', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('shows a readable error when WebGPU is unavailable', async () => {
		render(FragCanvas, {
			props: {
				material
			}
		});

		const error = await screen.findByTestId('fragkit-error');
		expect(error.textContent).toContain('WebGPU unavailable');
		expect(error.textContent).toContain('WebGPU is not available');
		expect(error.textContent).toContain('Use a browser with WebGPU enabled');
	});
});
