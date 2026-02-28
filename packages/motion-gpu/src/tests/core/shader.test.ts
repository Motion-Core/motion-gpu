import { describe, expect, it } from 'vitest';
import {
	buildShaderSource,
	buildShaderSourceWithMap,
	formatShaderSourceLocation
} from '../../lib/core/shader';
import { resolveUniformLayout } from '../../lib/core/uniforms';

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
		expect(shader).toContain('let motiongpuKeepAlive = motiongpuUniforms.intensity.x;');
		expect(shader).toContain(
			'return vec4f(fragColor.rgb + motiongpuKeepAlive * 0.0, fragColor.a);'
		);
		expect(shader).toMatchSnapshot();
	});

	it('keeps valid WGSL when there are no custom uniforms', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({})
		);
		expect(shader).toContain('motiongpu_unused: vec4f');
		expect(shader).toContain('let motiongpuKeepAlive = motiongpuUniforms.motiongpu_unused.x;');
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

		expect(shader).toContain('fn motiongpuLinearToSrgb(linearColor: vec3f) -> vec3f');
		expect(shader).toContain(
			'let motiongpuLinear = vec4f(fragColor.rgb + motiongpuKeepAlive * 0.0, fragColor.a);'
		);
		expect(shader).toContain(
			'let motiongpuSrgb = motiongpuLinearToSrgb(max(motiongpuLinear.rgb, vec3f(0.0)));'
		);
		expect(shader).toContain('return vec4f(motiongpuSrgb, motiongpuLinear.a);');
		expect(shader).toMatchSnapshot();
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
		expect(matShader).toContain('let motiongpuKeepAlive = motiongpuUniforms.uTransform[0].x;');
		expect(scalarShader).toContain('uScalar: f32');
		expect(scalarShader).toContain('let motiongpuKeepAlive = motiongpuUniforms.uScalar;');
	});

	it('maps generated shader lines back to material source locations', () => {
		const built = buildShaderSourceWithMap(
			[
				'const USE_TONE: bool = true;',
				'',
				'fn frag(uv: vec2f) -> vec4f {',
				'\treturn vec4f(uv, 0.0, 1.0);',
				'}'
			].join('\n'),
			resolveUniformLayout({}),
			[],
			{
				fragmentLineMap: [
					null,
					{ kind: 'define', line: 1, define: 'USE_TONE' },
					null,
					{ kind: 'fragment', line: 1 },
					{ kind: 'fragment', line: 2 },
					{ kind: 'fragment', line: 3 }
				]
			}
		);

		const mappedLines = built.lineMap
			.map((location, index) => ({ index, location }))
			.filter((entry) => entry.location !== null);

		expect(mappedLines.length).toBe(5);
		expect(formatShaderSourceLocation(mappedLines[0]?.location ?? null)).toContain(
			'define "USE_TONE"'
		);
		expect(
			formatShaderSourceLocation(mappedLines[mappedLines.length - 1]?.location ?? null)
		).toContain('user fragment line 3');
	});
});
