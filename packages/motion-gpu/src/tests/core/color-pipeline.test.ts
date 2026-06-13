import { describe, expect, it } from 'vitest';
import { buildPresentationShader, resolveColorPipeline } from '../../lib/core/color-pipeline';

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

	it('uses HDR intermediate rendering for Khronos PBR Neutral SDR presentation', () => {
		const pipeline = resolveColorPipeline({
			color: { toneMapping: 'khronos-pbr-neutral' },
			preferredCanvasFormat: 'bgra8unorm'
		});

		expect(pipeline.outputEncoding).toBe('srgb');
		expect(pipeline.toneMapping).toBe('khronos-pbr-neutral');
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

	it('rejects explicit HDR presentation combined with an SDR tone mapper', () => {
		expect(() =>
			resolveColorPipeline({
				color: { dynamicRange: 'hdr', toneMapping: 'khronos-pbr-neutral' },
				preferredCanvasFormat: 'bgra8unorm'
			})
		).toThrow(/Khronos PBR Neutral maps to SDR/i);
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
		expect(shader).not.toContain('motiongpuLinearToSrgb');
		expect(shader).toContain('return motiongpuLinear;');
	});
});
