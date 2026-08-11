import { describe, expect, it } from 'vitest';
import { buildPresentationShader, resolveColorPipeline } from '../../lib/core/color-pipeline';

const toneMappers = [
	['khronos-pbr-neutral', 'motiongpuKhronosPbrNeutral'],
	['uncharted2-filmic', 'motiongpuUncharted2Filmic'],
	['aces-hill', 'motiongpuAcesHill'],
	['gran-turismo', 'motiongpuGranTurismo']
] as const;

describe('color pipeline', () => {
	it('keeps SDR defaults compatible with the existing direct canvas path', () => {
		const pipeline = resolveColorPipeline({
			color: undefined,
			preferredCanvasFormat: 'rgba8unorm'
		});

		expect(pipeline.outputEncoding).toBe('srgb');
		expect(pipeline.toneMapping).toBe('none');
		expect(pipeline.dynamicRange).toBe('sdr');
		expect(pipeline.canvasFormat).toBe('rgba8unorm');
		expect(pipeline.workingFormat).toBe('rgba8unorm');
		expect(pipeline.requiresPresentationPass).toBe(false);
		expect(pipeline.canvasToneMappingMode).toBe('standard');
	});

	it.each(toneMappers)('uses HDR intermediate rendering for %s SDR presentation', (toneMapping) => {
		const pipeline = resolveColorPipeline({
			color: { toneMapping },
			preferredCanvasFormat: 'bgra8unorm'
		});

		expect(pipeline.outputEncoding).toBe('srgb');
		expect(pipeline.toneMapping).toBe(toneMapping);
		expect(pipeline.dynamicRange).toBe('sdr');
		expect(pipeline.canvasFormat).toBe('bgra8unorm');
		expect(pipeline.workingFormat).toBe('rgba16float');
		expect(pipeline.requiresPresentationPass).toBe(true);
		expect(pipeline.canvasToneMappingMode).toBe('standard');
	});

	it('uses an extended rgba16float canvas for HDR presentation', () => {
		const pipeline = resolveColorPipeline({
			color: { dynamicRange: 'hdr', canvasColorSpace: 'display-p3', outputEncoding: 'linear' },
			preferredCanvasFormat: 'bgra8unorm'
		});

		expect(pipeline.outputEncoding).toBe('linear');
		expect(pipeline.dynamicRange).toBe('hdr');
		expect(pipeline.canvasColorSpace).toBe('display-p3');
		expect(pipeline.canvasFormat).toBe('rgba16float');
		expect(pipeline.workingFormat).toBe('rgba16float');
		expect(pipeline.requiresPresentationPass).toBe(true);
		expect(pipeline.canvasToneMappingMode).toBe('extended');
	});

	it.each(toneMappers)('rejects explicit HDR presentation combined with %s', (toneMapping) => {
		expect(() =>
			resolveColorPipeline({
				color: { dynamicRange: 'hdr', toneMapping },
				preferredCanvasFormat: 'bgra8unorm'
			})
		).toThrow(/Tone mapping produces SDR output/i);
	});

	it('builds the final presentation shader with Khronos PBR Neutral before sRGB encoding', () => {
		const shader = buildPresentationShader({
			toneMapping: 'khronos-pbr-neutral',
			convertLinearToSrgb: true,
			dynamicRange: 'sdr'
		});

		expect(shader).toContain('fn motiongpuKhronosPbrNeutral(colorInput: vec3f) -> vec3f');
		expect(shader).toContain('let startCompression = 0.8 - 0.04;');
		expect(shader).toContain('let desaturation = 0.15;');
		expect(shader).toContain('let motiongpuToneMapped = motiongpuKhronosPbrNeutral');
		expect(shader).toContain(
			'let motiongpuPresented = motiongpuLinearToSrgb(motiongpuToneMapped);'
		);
		expect(shader.indexOf('motiongpuKhronosPbrNeutral')).toBeLessThan(
			shader.indexOf('motiongpuLinearToSrgb(motiongpuToneMapped)')
		);
	});

	it('builds the reference Uncharted 2 filmic curve', () => {
		const shader = buildPresentationShader({
			toneMapping: 'uncharted2-filmic',
			convertLinearToSrgb: true,
			dynamicRange: 'sdr'
		});

		expect(shader).toContain('fn motiongpuUncharted2Partial(color: vec3f) -> vec3f');
		expect(shader).toContain('let a = 0.15;');
		expect(shader).toContain('let b = 0.50;');
		expect(shader).toContain('let c = 0.10;');
		expect(shader).toContain('let d = 0.20;');
		expect(shader).toContain('let e = 0.02;');
		expect(shader).toContain('let f = 0.30;');
		expect(shader).toContain('let exposureBias = 2.0;');
		expect(shader).toContain('let whitePoint = vec3f(11.2);');
		expect(shader).toContain(
			'let whiteScale = vec3f(1.0) / motiongpuUncharted2Partial(whitePoint);'
		);
		expect(shader).toContain(
			'let motiongpuToneMapped = motiongpuUncharted2Filmic(max(motiongpuLinear.rgb, vec3f(0.0)));'
		);
	});

	it('builds the Stephen Hill ACES fit with its input and output transforms', () => {
		const shader = buildPresentationShader({
			toneMapping: 'aces-hill',
			convertLinearToSrgb: true,
			dynamicRange: 'sdr'
		});

		expect(shader).toContain('fn motiongpuAcesHillFit(color: vec3f) -> vec3f');
		expect(shader).toContain('color * (color + vec3f(0.0245786)) - vec3f(0.000090537)');
		expect(shader).toContain(
			'color * (vec3f(0.983729) * color + vec3f(0.4329510)) + vec3f(0.238081)'
		);
		expect(shader).toContain('vec3f(0.59719, 0.07600, 0.02840)');
		expect(shader).toContain('vec3f(0.35458, 0.90834, 0.13383)');
		expect(shader).toContain('vec3f(0.04823, 0.01566, 0.83777)');
		expect(shader).toContain('vec3f(1.60475, -0.10208, -0.00327)');
		expect(shader).toContain('vec3f(-0.53108, 1.10813, -0.07276)');
		expect(shader).toContain('vec3f(-0.07367, -0.00605, 1.07602)');
		expect(shader).toContain('return clamp(color, vec3f(0.0), vec3f(1.0));');
	});

	it('builds the reference Gran Turismo triple-section curve', () => {
		const shader = buildPresentationShader({
			toneMapping: 'gran-turismo',
			convertLinearToSrgb: true,
			dynamicRange: 'sdr'
		});

		expect(shader).toContain('fn motiongpuGranTurismo(color: vec3f) -> vec3f');
		expect(shader).toContain('let p = 1.0;');
		expect(shader).toContain('let a = 1.0;');
		expect(shader).toContain('let m = 0.22;');
		expect(shader).toContain('let l = 0.4;');
		expect(shader).toContain('let c = 1.33;');
		expect(shader).toContain('let b = 0.0;');
		expect(shader).toContain('let l0 = ((p - m) * l) / a;');
		expect(shader).toContain('let c2 = (a * p) / (p - s1);');
		expect(shader).toContain('let w0 = vec3f(1.0) - smoothstep(vec3f(0.0), vec3f(m), color);');
		expect(shader).toContain('let w2 = step(vec3f(m + l0), color);');
		expect(shader).toContain('return toe * w0 + linear * w1 + shoulder * w2;');
	});

	it.each(toneMappers)('applies %s before sRGB encoding', (toneMapping, helper) => {
		const shader = buildPresentationShader({
			toneMapping,
			convertLinearToSrgb: true,
			dynamicRange: 'sdr'
		});

		expect(shader.indexOf(`let motiongpuToneMapped = ${helper}`)).toBeLessThan(
			shader.indexOf('motiongpuLinearToSrgb(motiongpuToneMapped)')
		);
	});

	it('can premultiply final presentation alpha for canvas compositing', () => {
		const shader = buildPresentationShader({
			toneMapping: 'none',
			convertLinearToSrgb: false,
			dynamicRange: 'sdr',
			premultiplyAlpha: true
		});

		expect(shader).toContain('fn motiongpuPremultiplyForCanvas(color: vec4f) -> vec4f');
		expect(shader).toContain('let motiongpuAlpha = clamp(color.a, 0.0, 1.0);');
		expect(shader).toContain('return motiongpuPremultiplyForCanvas(motiongpuLinear);');
	});

	it('premultiplies final presentation alpha after tone mapping and sRGB encoding', () => {
		const shader = buildPresentationShader({
			toneMapping: 'khronos-pbr-neutral',
			convertLinearToSrgb: true,
			dynamicRange: 'sdr',
			premultiplyAlpha: true
		});

		expect(shader).toContain(
			'let motiongpuPresented = motiongpuLinearToSrgb(motiongpuToneMapped);'
		);
		expect(shader).toContain('let motiongpuOutput = vec4f(motiongpuPresented, motiongpuLinear.a);');
		expect(shader).toContain('return motiongpuPremultiplyForCanvas(motiongpuOutput);');
		expect(shader.indexOf('motiongpuKhronosPbrNeutral')).toBeLessThan(
			shader.indexOf('motiongpuLinearToSrgb(motiongpuToneMapped)')
		);
		expect(shader.indexOf('motiongpuLinearToSrgb(motiongpuToneMapped)')).toBeLessThan(
			shader.indexOf('motiongpuPremultiplyForCanvas(motiongpuOutput)')
		);
	});

	it('samples presentation textures in framebuffer coordinates instead of material uv coordinates', () => {
		const shader = buildPresentationShader({
			toneMapping: 'none',
			convertLinearToSrgb: false,
			dynamicRange: 'sdr'
		});

		expect(shader).toContain('out.uv = vec2f((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);');
		expect(shader).toContain(
			'textureSample(motiongpuPresentationTexture, motiongpuPresentationSampler, in.uv)'
		);
		expect(shader).not.toContain('out.uv = (position + vec2f(1.0, 1.0)) * 0.5;');
	});

	it('does not apply SDR encoding in HDR passthrough presentation', () => {
		const shader = buildPresentationShader({
			toneMapping: 'none',
			convertLinearToSrgb: false,
			dynamicRange: 'hdr'
		});

		expect(shader).not.toContain('motiongpuKhronosPbrNeutral');
		expect(shader).not.toContain('motiongpuUncharted2Filmic');
		expect(shader).not.toContain('motiongpuAcesHill');
		expect(shader).not.toContain('motiongpuGranTurismo');
		expect(shader).not.toContain('motiongpuLinearToSrgb');
		expect(shader).toContain('return motiongpuLinear;');
	});
});
