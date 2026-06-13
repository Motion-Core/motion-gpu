import type {
	CanvasColorSpace,
	ColorPipelineOptions,
	OutputEncoding,
	OutputDynamicRange,
	ToneMapping
} from './types.js';

export type EffectiveDynamicRange = Exclude<OutputDynamicRange, 'auto'>;

export interface ResolveColorPipelineInput {
	color: ColorPipelineOptions | undefined;
	preferredCanvasFormat: GPUTextureFormat;
}

export interface ResolvedColorPipeline {
	toneMapping: ToneMapping;
	dynamicRange: OutputDynamicRange;
	canvasColorSpace: CanvasColorSpace;
	canvasFormat: GPUTextureFormat;
	fallbackCanvasFormat: GPUTextureFormat;
	workingFormat: GPUTextureFormat;
	requiresPresentationPass: boolean;
	canvasToneMappingMode: 'standard' | 'extended';
	outputEncoding: OutputEncoding;
}

export interface PresentationShaderOptions {
	toneMapping: ToneMapping;
	convertLinearToSrgb: boolean;
	dynamicRange: EffectiveDynamicRange;
	premultiplyAlpha?: boolean;
}

export interface CanvasConfigurationOptions {
	device: GPUDevice;
	format: GPUTextureFormat;
	dynamicRange: EffectiveDynamicRange;
	canvasColorSpace: CanvasColorSpace;
}

type CanvasConfigurationWithHdr = GPUCanvasConfiguration & {
	colorSpace?: CanvasColorSpace;
	toneMapping?: { mode: 'standard' | 'extended' };
};

export const HDR_WORKING_FORMAT: GPUTextureFormat = 'rgba16float';
export const HDR_CANVAS_FORMAT: GPUTextureFormat = 'rgba16float';

export function resolveColorPipeline(input: ResolveColorPipelineInput): ResolvedColorPipeline {
	const outputEncoding = input.color?.outputEncoding ?? 'srgb';
	const toneMapping = input.color?.toneMapping ?? 'none';
	const requestedDynamicRange = input.color?.dynamicRange ?? 'sdr';
	if (toneMapping !== 'none' && requestedDynamicRange === 'hdr') {
		throw new Error(
			'Khronos PBR Neutral maps to SDR. Use dynamicRange:"sdr"/"auto" with toneMapping, or set toneMapping:"none" for HDR presentation.'
		);
	}

	const dynamicRange: OutputDynamicRange =
		toneMapping !== 'none' && requestedDynamicRange === 'auto' ? 'sdr' : requestedDynamicRange;
	const wantsHdrCanvas = dynamicRange === 'hdr' || dynamicRange === 'auto';
	const canvasFormat = wantsHdrCanvas ? HDR_CANVAS_FORMAT : input.preferredCanvasFormat;
	const explicitWorkingFormat = input.color?.workingFormat;
	const workingFormat =
		explicitWorkingFormat && explicitWorkingFormat !== 'auto'
			? explicitWorkingFormat
			: toneMapping !== 'none' || wantsHdrCanvas
				? HDR_WORKING_FORMAT
				: input.preferredCanvasFormat;
	const requiresPresentationPass =
		toneMapping !== 'none' || wantsHdrCanvas || workingFormat !== input.preferredCanvasFormat;

	return {
		toneMapping,
		dynamicRange,
		canvasColorSpace: input.color?.canvasColorSpace ?? 'srgb',
		canvasFormat,
		fallbackCanvasFormat: input.preferredCanvasFormat,
		workingFormat,
		requiresPresentationPass,
		canvasToneMappingMode: wantsHdrCanvas ? 'extended' : 'standard',
		outputEncoding
	};
}

export function shouldConvertLinearToSrgb(
	outputEncoding: OutputEncoding,
	canvasFormat: GPUTextureFormat,
	dynamicRange: EffectiveDynamicRange
): boolean {
	if (outputEncoding !== 'srgb' || dynamicRange === 'hdr') {
		return false;
	}

	return !canvasFormat.endsWith('-srgb');
}

export function buildCanvasConfiguration(
	options: CanvasConfigurationOptions
): CanvasConfigurationWithHdr {
	const configuration: CanvasConfigurationWithHdr = {
		device: options.device,
		format: options.format,
		alphaMode: 'premultiplied'
	};

	if (options.canvasColorSpace !== 'srgb') {
		configuration.colorSpace = options.canvasColorSpace;
	}

	if (options.dynamicRange === 'hdr') {
		configuration.toneMapping = { mode: 'extended' };
	}

	return configuration;
}

function buildLinearToSrgbHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn motiongpuLinearToSrgb(linearColor: vec3f) -> vec3f {
	let cutoff = vec3f(0.0031308);
	let lower = linearColor * 12.92;
	let higher = vec3f(1.055) * pow(linearColor, vec3f(1.0 / 2.4)) - vec3f(0.055);
	return select(lower, higher, linearColor > cutoff);
}
`;
}

function buildKhronosPbrNeutralHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn motiongpuKhronosPbrNeutral(colorInput: vec3f) -> vec3f {
	var color = max(colorInput, vec3f(0.0));
	let startCompression = 0.8 - 0.04;
	let desaturation = 0.15;
	let x = min(color.r, min(color.g, color.b));
	let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
	color = color - vec3f(offset);
	let peak = max(color.r, max(color.g, color.b));
	if (peak < startCompression) {
		return color;
	}
	let d = 1.0 - startCompression;
	let newPeak = 1.0 - d * d / (peak + d - startCompression);
	color = color * (newPeak / peak);
	let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
	return mix(color, newPeak * vec3f(1.0), g);
}
`;
}

function buildCanvasPremultiplyHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn motiongpuPremultiplyForCanvas(color: vec4f) -> vec4f {
	let motiongpuAlpha = clamp(color.a, 0.0, 1.0);
	return vec4f(color.rgb * motiongpuAlpha, motiongpuAlpha);
}
`;
}

function buildPresentationFinalReturn(colorExpression: string, premultiplyAlpha: boolean): string {
	if (premultiplyAlpha) {
		return `let motiongpuOutput = ${colorExpression};
	return motiongpuPremultiplyForCanvas(motiongpuOutput);`;
	}

	return `return ${colorExpression};`;
}

function buildPresentationReturn(options: PresentationShaderOptions): string {
	const premultiplyAlpha = options.premultiplyAlpha ?? false;
	if (options.toneMapping === 'none' && !options.convertLinearToSrgb) {
		return premultiplyAlpha
			? 'return motiongpuPremultiplyForCanvas(motiongpuLinear);'
			: 'return motiongpuLinear;';
	}

	const lines: string[] = [];
	let colorExpression = 'motiongpuLinear.rgb';

	if (options.toneMapping === 'khronos-pbr-neutral') {
		lines.push(
			'let motiongpuToneMapped = motiongpuKhronosPbrNeutral(max(motiongpuLinear.rgb, vec3f(0.0)));'
		);
		colorExpression = 'motiongpuToneMapped';
	} else if (options.convertLinearToSrgb) {
		lines.push('let motiongpuNonNegative = max(motiongpuLinear.rgb, vec3f(0.0));');
		colorExpression = 'motiongpuNonNegative';
	}

	if (options.convertLinearToSrgb) {
		lines.push(`let motiongpuPresented = motiongpuLinearToSrgb(${colorExpression});`);
		lines.push(
			buildPresentationFinalReturn('vec4f(motiongpuPresented, motiongpuLinear.a)', premultiplyAlpha)
		);
	} else {
		lines.push(
			buildPresentationFinalReturn(`vec4f(${colorExpression}, motiongpuLinear.a)`, premultiplyAlpha)
		);
	}

	return lines.join('\n\t');
}

export function buildPresentationShader(options: PresentationShaderOptions): string {
	const includeToneMapping = options.toneMapping === 'khronos-pbr-neutral';
	const includeSrgb = options.convertLinearToSrgb;
	const includePremultiply = options.premultiplyAlpha ?? false;
	const presentationReturn = buildPresentationReturn(options);

	return `
struct MotionGPUVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@group(0) @binding(0) var motiongpuPresentationSampler: sampler;
@group(0) @binding(1) var motiongpuPresentationTexture: texture_2d<f32>;
${buildKhronosPbrNeutralHelper(includeToneMapping)}
${buildLinearToSrgbHelper(includeSrgb)}
${buildCanvasPremultiplyHelper(includePremultiply)}
@vertex
fn motiongpuPresentationVertex(@builtin(vertex_index) index: u32) -> MotionGPUVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: MotionGPUVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = vec2f((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
	return out;
}

@fragment
fn motiongpuPresentationFragment(in: MotionGPUVertexOut) -> @location(0) vec4f {
	let motiongpuLinear = textureSample(motiongpuPresentationTexture, motiongpuPresentationSampler, in.uv);
	${presentationReturn}
}
`;
}
