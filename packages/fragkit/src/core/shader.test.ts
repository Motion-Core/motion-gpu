import { describe, expect, it } from 'vitest';
import { buildShaderSource } from './shader';

describe('buildShaderSource', () => {
	it('injects user uniforms and frag wrapper', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			['intensity', 'tint']
		);

		expect(shader).toContain('intensity: vec4f');
		expect(shader).toContain('tint: vec4f');
		expect(shader).toContain('return frag(in.uv);');
	});

	it('keeps valid WGSL when there are no custom uniforms', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			[]
		);
		expect(shader).toContain('__unused: vec4f');
	});
});
