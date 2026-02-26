import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FragCanvas from './FragCanvas.svelte';

const fragmentWgsl = `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.5, 1.0);
}
`;

describe('FragCanvas', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('shows a readable error when WebGPU is unavailable', async () => {
		const { findByTestId } = render(FragCanvas, {
			props: {
				fragmentWgsl
			}
		});

		const error = await findByTestId('fragkit-error');
		expect(error.textContent).toContain('WebGPU is not available');
	});
});
