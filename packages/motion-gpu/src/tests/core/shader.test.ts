import { describe, expect, it } from 'vitest';
import {
	buildPingPongShaderSource,
	buildPingPongShaderSourceWithMap,
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

	it('can premultiply output alpha for direct canvas writes', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 0.5); }',
			resolveUniformLayout({ uMix: { type: 'f32', value: 1 } }),
			[],
			{ premultiplyOutputAlpha: true }
		);

		expect(shader).toContain('fn motiongpuPremultiplyForCanvas(color: vec4f) -> vec4f');
		expect(shader).toContain('let motiongpuAlpha = clamp(color.a, 0.0, 1.0);');
		expect(shader).toContain(
			'let motiongpuOutput = vec4f(fragColor.rgb + motiongpuKeepAlive * 0.0, fragColor.a);'
		);
		expect(shader).toContain('return motiongpuPremultiplyForCanvas(motiongpuOutput);');
	});

	it('premultiplies after linear to sRGB conversion for direct canvas writes', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 0.5); }',
			resolveUniformLayout({ uMix: { type: 'f32', value: 1 } }),
			[],
			{ convertLinearToSrgb: true, premultiplyOutputAlpha: true }
		);

		expect(shader).toContain(
			'let motiongpuSrgb = motiongpuLinearToSrgb(max(motiongpuLinear.rgb, vec3f(0.0)));'
		);
		expect(shader).toContain('let motiongpuOutput = vec4f(motiongpuSrgb, motiongpuLinear.a);');
		expect(shader).toContain('return motiongpuPremultiplyForCanvas(motiongpuOutput);');
		expect(shader.indexOf('motiongpuLinearToSrgb(max')).toBeLessThan(
			shader.indexOf('motiongpuPremultiplyForCanvas(motiongpuOutput)')
		);
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
		).toContain('fragment line 3');
	});

	it('generates read-only storage buffer bindings for fragment shader', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({}),
			[],
			{
				storageBufferKeys: ['particles', 'velocities'],
				storageBufferDefinitions: {
					particles: { type: 'array<vec4f>' },
					velocities: { type: 'array<vec4f>' }
				}
			}
		);

		expect(shader).toContain('@group(1) @binding(0) var<storage, read> particles: array<vec4f>;');
		expect(shader).toContain('@group(1) @binding(1) var<storage, read> velocities: array<vec4f>;');
	});

	it('places storage buffer bindings in group(1)', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({}),
			[],
			{
				storageBufferKeys: ['data'],
				storageBufferDefinitions: { data: { type: 'array<f32>' } }
			}
		);

		expect(shader).toContain('@group(1) @binding(0)');
		expect(shader).not.toContain('@group(2)');
	});

	it('skips storage buffer bindings when list is empty', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({}),
			[],
			{
				storageBufferKeys: [],
				storageBufferDefinitions: {}
			}
		);

		expect(shader).not.toContain('@group(1)');
	});

	it('snapshot: fragment shader with storage buffers', () => {
		const shader = buildShaderSource(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			resolveUniformLayout({ uMix: 0.5 }),
			['uTexture'],
			{
				storageBufferKeys: ['positions', 'colors'],
				storageBufferDefinitions: {
					positions: { type: 'array<vec4f>' },
					colors: { type: 'array<vec4f>' }
				}
			}
		);

		expect(shader).toMatchSnapshot();
	});

	it('builds ping-pong fragment shaders with previous texture bindings', () => {
		const shader = buildPingPongShaderSource(
			[
				'fn frag(uv: vec2f) -> vec4f {',
				'\tlet previous = textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);',
				'\tlet image = textureSample(uImage, uImageSampler, uv);',
				'\treturn mix(previous, image, motiongpuUniforms.uBlend);',
				'}'
			].join('\n'),
			resolveUniformLayout({ uBlend: { type: 'f32', value: 0.5 } }),
			['uImage']
		);

		expect(shader).toContain('@group(0) @binding(0) var<uniform> motiongpuFrame');
		expect(shader).toContain('@group(0) @binding(1) var<uniform> motiongpuUniforms');
		expect(shader).toContain('@group(0) @binding(2) var uImageSampler: sampler;');
		expect(shader).toContain('@group(0) @binding(3) var uImage: texture_2d<f32>;');
		expect(shader).toContain('@group(1) @binding(0) var motiongpuPreviousSampler: sampler;');
		expect(shader).toContain('@group(1) @binding(1) var motiongpuPrevious: texture_2d<f32>;');
		expect(shader).toContain('fn motiongpuPingPongFragment');
		expect(shader).toContain('out.uv = vec2f((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);');
		expect(shader).toContain('let fragColor = frag(in.uv);');
		expect(shader).toContain('let motiongpuKeepAlive = motiongpuUniforms.uBlend;');
	});

	it('maps ping-pong generated shader lines back to fragment source locations', () => {
		const fragment = [
			'const GAIN: f32 = 1.0;',
			'',
			'fn frag(uv: vec2f) -> vec4f {',
			'\treturn textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0) * GAIN;',
			'}'
		].join('\n');
		const built = buildPingPongShaderSourceWithMap(fragment, resolveUniformLayout({}), [], {
			fragmentLineMap: [
				null,
				{ kind: 'define', line: 1, define: 'GAIN' },
				null,
				{ kind: 'fragment', line: 1 },
				{ kind: 'fragment', line: 2 },
				{ kind: 'fragment', line: 3 }
			]
		});

		const mappedLines = built.lineMap
			.map((location, index) => ({ index, location }))
			.filter((entry) => entry.location !== null);

		expect(mappedLines.length).toBe(5);
		expect(formatShaderSourceLocation(mappedLines[0]?.location ?? null)).toContain('define "GAIN"');
		expect(
			formatShaderSourceLocation(mappedLines[mappedLines.length - 1]?.location ?? null)
		).toContain('fragment line 3');
	});
});
