import { describe, expect, it } from 'vitest';
import { buildShaderSource } from '../lib/core/shader';
import { resolveUniformLayout } from '../lib/core/uniforms';

describe('buildShaderSource', () => {
	it('injects user uniforms and frag wrapper', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({
				intensity: { type: 'vec4f', value: [1, 0, 0, 0] },
				tint: [1, 1, 1, 1]
			}),
			['uTexture1']
		);

		expect(shader).toContain('intensity: vec4f');
		expect(shader).toContain('tint: vec4f');
		expect(shader).toContain('@group(0) @binding(2) var uTexture1Sampler: sampler;');
		expect(shader).toContain('@group(0) @binding(3) var uTexture1: texture_2d<f32>;');
		expect(shader).toContain('let fragColor = frag(in.uv);');
		expect(shader).toContain('let fragkitKeepAlive = fragkitUniforms.intensity.x;');
		expect(shader).toContain('return vec4f(fragColor.rgb + fragkitKeepAlive * 0.0, fragColor.a);');
	});

	it('keeps valid WGSL when there are no custom uniforms', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({})
		);
		expect(shader).toContain('fragkit_unused: vec4f');
		expect(shader).toContain('let fragkitKeepAlive = fragkitUniforms.fragkit_unused.x;');
	});

	it('assigns deterministic bindings for multiple textures', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({}),
			['uTexture1', 'uTexture2']
		);

		expect(shader).toContain('@group(0) @binding(2) var uTexture1Sampler: sampler;');
		expect(shader).toContain('@group(0) @binding(3) var uTexture1: texture_2d<f32>;');
		expect(shader).toContain('@group(0) @binding(4) var uTexture2Sampler: sampler;');
		expect(shader).toContain('@group(0) @binding(5) var uTexture2: texture_2d<f32>;');
	});

	it('can inject linear to srgb conversion for output color', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({ uMix: { type: 'f32', value: 1 } }),
			[],
			{ convertLinearToSrgb: true }
		);

		expect(shader).toContain('fn fragkitLinearToSrgb(linearColor: vec3f) -> vec3f');
		expect(shader).toContain(
			'let fragkitLinear = vec4f(fragColor.rgb + fragkitKeepAlive * 0.0, fragColor.a);'
		);
		expect(shader).toContain(
			'let fragkitSrgb = fragkitLinearToSrgb(max(fragkitLinear.rgb, vec3f(0.0)));'
		);
		expect(shader).toContain('return vec4f(fragkitSrgb, fragkitLinear.a);');
	});

	it('supports mat4 and scalar keep-alive access patterns', () => {
		const mat4 = new Array(16).fill(0);
		mat4[0] = 1;
		const matShader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({ uTransform: { type: 'mat4x4f', value: mat4 } })
		);
		const scalarShader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({ uScalar: { type: 'f32', value: 1 } })
		);

		expect(matShader).toContain('uTransform: mat4x4f');
		expect(matShader).toContain('let fragkitKeepAlive = fragkitUniforms.uTransform[0].x;');
		expect(scalarShader).toContain('uScalar: f32');
		expect(scalarShader).toContain('let fragkitKeepAlive = fragkitUniforms.uScalar;');
	});
});
