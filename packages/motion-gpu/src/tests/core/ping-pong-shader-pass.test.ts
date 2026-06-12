import { describe, expect, it } from 'vitest';
import { PingPongShaderPass } from '../../lib/passes/PingPongShaderPass';

const validFragment = `
fn frag(uv: vec2f) -> vec4f {
	let previous = textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);
	return previous + vec4f(0.01, 0.0, 0.0, 0.0);
}
`;

describe('PingPongShaderPass', () => {
	it('creates a fragment feedback pass with production defaults', () => {
		const pass = new PingPongShaderPass({
			fragment: validFragment,
			target: 'fluid'
		});

		expect(pass.enabled).toBe(true);
		expect(pass.isPingPongShader).toBe(true);
		expect(pass.getTarget()).toBe('fluid');
		expect(pass.getFragment()).toBe(validFragment);
		expect(pass.getIterations()).toBe(1);
		expect(pass.getFormat()).toBe('rgba16float');
		expect(pass.getFilter()).toBe('linear');
		expect(pass.getAddressModeU()).toBe('clamp-to-edge');
		expect(pass.getAddressModeV()).toBe('clamp-to-edge');
		expect(pass.getClearColor()).toEqual([0, 0, 0, 0]);
		expect(pass.resolveSize({ width: 320, height: 180 })).toEqual({ width: 320, height: 180 });
	});

	it('supports explicit dimensions, scale and sampler options', () => {
		const pass = new PingPongShaderPass({
			fragment: validFragment,
			target: 'fluid',
			width: 128,
			scale: 0.5,
			filter: 'nearest',
			addressModeU: 'repeat',
			addressModeV: 'mirror-repeat'
		});

		expect(pass.resolveSize({ width: 640, height: 480 })).toEqual({ width: 128, height: 240 });
		expect(pass.getFilter()).toBe('nearest');
		expect(pass.getAddressModeU()).toBe('repeat');
		expect(pass.getAddressModeV()).toBe('mirror-repeat');
	});

	it('preprocesses defines and includes for the fragment source', () => {
		const pass = new PingPongShaderPass({
			fragment: `
#include <helpers>
fn frag(uv: vec2f) -> vec4f {
	return applyGain(textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0));
}
`,
			target: 'fluid',
			defines: { GAIN: 2 },
			includes: {
				helpers: 'fn applyGain(color: vec4f) -> vec4f { return color * GAIN; }'
			}
		});

		expect(pass.getFragment()).toContain('const GAIN: f32 = 2.0;');
		expect(pass.getFragment()).toContain('fn applyGain(color: vec4f) -> vec4f');
		expect(pass.getFragmentLineMap().some((entry) => entry?.kind === 'include')).toBe(true);
	});

	it('validates the same fragment contract as material shaders', () => {
		expect(
			() =>
				new PingPongShaderPass({
					fragment: 'fn shade(uv: vec2f) -> vec4f { return vec4f(1.0); }',
					target: 'fluid'
				})
		).toThrow(/fn frag\(uv: vec2f\) -> vec4f/);
	});

	it('validates iteration count and renderable sampled format', () => {
		expect(
			() =>
				new PingPongShaderPass({
					fragment: validFragment,
					target: 'fluid',
					iterations: 0
				})
		).toThrow(/positive integer >= 1/);

		expect(
			() =>
				new PingPongShaderPass({
					fragment: validFragment,
					target: 'fluid',
					format: 'r32uint'
				})
		).toThrow(/float-sampled/);
	});

	it('tracks current output parity across frames and reset requests', () => {
		const pass = new PingPongShaderPass({
			fragment: validFragment,
			target: 'fluid',
			iterations: 3
		});

		expect(pass.getCurrentOutput()).toBe('fluidA');
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('fluidB');

		pass.setIterations(2);
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('fluidB');

		pass.reset([0.2, 0.3, 0.4, 1]);
		expect(pass.consumeResetColor()).toEqual([0.2, 0.3, 0.4, 1]);
		expect(pass.consumeResetColor()).toBeNull();
		expect(pass.getCurrentOutput()).toBe('fluidA');
	});
});
