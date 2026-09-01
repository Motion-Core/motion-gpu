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
			'Tone mapping produces SDR output. Use dynamicRange:"sdr"/"auto" with toneMapping, or set toneMapping:"none" for HDR presentation.'
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
fn spektralLinearToSrgb(linearColor: vec3f) -> vec3f {
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
fn spektralKhronosPbrNeutral(colorInput: vec3f) -> vec3f {
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

function buildUncharted2FilmicHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn spektralUncharted2Partial(color: vec3f) -> vec3f {
	let a = 0.15;
	let b = 0.50;
	let c = 0.10;
	let d = 0.20;
	let e = 0.02;
	let f = 0.30;
	let numerator = color * (a * color + vec3f(c * b)) + vec3f(d * e);
	let denominator = color * (a * color + vec3f(b)) + vec3f(d * f);
	return numerator / denominator - vec3f(e / f);
}

fn spektralUncharted2Filmic(color: vec3f) -> vec3f {
	let exposureBias = 2.0;
	let whitePoint = vec3f(11.2);
	let whiteScale = vec3f(1.0) / spektralUncharted2Partial(whitePoint);
	return spektralUncharted2Partial(exposureBias * color) * whiteScale;
}
`;
}

function buildAcesHillHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn spektralAcesHillFit(color: vec3f) -> vec3f {
	let a = color * (color + vec3f(0.0245786)) - vec3f(0.000090537);
	let b = color * (vec3f(0.983729) * color + vec3f(0.4329510)) + vec3f(0.238081);
	return a / b;
}

fn spektralAcesHill(colorInput: vec3f) -> vec3f {
	let inputMatrix = mat3x3f(
		vec3f(0.59719, 0.07600, 0.02840),
		vec3f(0.35458, 0.90834, 0.13383),
		vec3f(0.04823, 0.01566, 0.83777)
	);
	let outputMatrix = mat3x3f(
		vec3f(1.60475, -0.10208, -0.00327),
		vec3f(-0.53108, 1.10813, -0.07276),
		vec3f(-0.07367, -0.00605, 1.07602)
	);
	var color = inputMatrix * colorInput;
	color = spektralAcesHillFit(color);
	color = outputMatrix * color;
	return clamp(color, vec3f(0.0), vec3f(1.0));
}
`;
}

function buildGranTurismoHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn spektralGranTurismo(color: vec3f) -> vec3f {
	let p = 1.0;
	let a = 1.0;
	let m = 0.22;
	let l = 0.4;
	let c = 1.33;
	let b = 0.0;
	let l0 = ((p - m) * l) / a;
	let s0 = m + l0;
	let s1 = m + a * l0;
	let c2 = (a * p) / (p - s1);
	let cp = -c2 / p;
	let w0 = vec3f(1.0) - smoothstep(vec3f(0.0), vec3f(m), color);
	let w2 = step(vec3f(m + l0), color);
	let w1 = vec3f(1.0) - w0 - w2;
	let toe = vec3f(m) * pow(color / vec3f(m), vec3f(c)) + vec3f(b);
	let linear = vec3f(m) + a * (color - vec3f(m));
	let shoulder = vec3f(p) - vec3f(p - s1) * exp(vec3f(cp) * (color - vec3f(s0)));
	return toe * w0 + linear * w1 + shoulder * w2;
}
`;
}

function buildCanvasPremultiplyHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn spektralPremultiplyForCanvas(color: vec4f) -> vec4f {
	let spektralAlpha = clamp(color.a, 0.0, 1.0);
	return vec4f(color.rgb * spektralAlpha, spektralAlpha);
}
`;
}

function buildPresentationFinalReturn(colorExpression: string, premultiplyAlpha: boolean): string {
	if (premultiplyAlpha) {
		return `let spektralOutput = ${colorExpression};
	return spektralPremultiplyForCanvas(spektralOutput);`;
	}

	return `return ${colorExpression};`;
}

function buildPresentationReturn(options: PresentationShaderOptions): string {
	const premultiplyAlpha = options.premultiplyAlpha ?? false;
	if (options.toneMapping === 'none' && !options.convertLinearToSrgb) {
		return premultiplyAlpha
			? 'return spektralPremultiplyForCanvas(spektralLinear);'
			: 'return spektralLinear;';
	}

	const lines: string[] = [];
	let colorExpression = 'spektralLinear.rgb';

	if (options.toneMapping === 'khronos-pbr-neutral') {
		lines.push(
			'let spektralToneMapped = spektralKhronosPbrNeutral(max(spektralLinear.rgb, vec3f(0.0)));'
		);
		colorExpression = 'spektralToneMapped';
	} else if (options.toneMapping === 'uncharted2-filmic') {
		lines.push(
			'let spektralToneMapped = spektralUncharted2Filmic(max(spektralLinear.rgb, vec3f(0.0)));'
		);
		colorExpression = 'spektralToneMapped';
	} else if (options.toneMapping === 'aces-hill') {
		lines.push('let spektralToneMapped = spektralAcesHill(max(spektralLinear.rgb, vec3f(0.0)));');
		colorExpression = 'spektralToneMapped';
	} else if (options.toneMapping === 'gran-turismo') {
		lines.push(
			'let spektralToneMapped = spektralGranTurismo(max(spektralLinear.rgb, vec3f(0.0)));'
		);
		colorExpression = 'spektralToneMapped';
	} else if (options.convertLinearToSrgb) {
		lines.push('let spektralNonNegative = max(spektralLinear.rgb, vec3f(0.0));');
		colorExpression = 'spektralNonNegative';
	}

	if (options.convertLinearToSrgb) {
		lines.push(`let spektralPresented = spektralLinearToSrgb(${colorExpression});`);
		lines.push(
			buildPresentationFinalReturn('vec4f(spektralPresented, spektralLinear.a)', premultiplyAlpha)
		);
	} else {
		lines.push(
			buildPresentationFinalReturn(`vec4f(${colorExpression}, spektralLinear.a)`, premultiplyAlpha)
		);
	}

	return lines.join('\n\t');
}

export function buildPresentationShader(options: PresentationShaderOptions): string {
	const includeSrgb = options.convertLinearToSrgb;
	const includePremultiply = options.premultiplyAlpha ?? false;
	const presentationReturn = buildPresentationReturn(options);

	return `
struct SpektralVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@group(0) @binding(0) var spektralPresentationSampler: sampler;
@group(0) @binding(1) var spektralPresentationTexture: texture_2d<f32>;
${buildKhronosPbrNeutralHelper(options.toneMapping === 'khronos-pbr-neutral')}
${buildUncharted2FilmicHelper(options.toneMapping === 'uncharted2-filmic')}
${buildAcesHillHelper(options.toneMapping === 'aces-hill')}
${buildGranTurismoHelper(options.toneMapping === 'gran-turismo')}
${buildLinearToSrgbHelper(includeSrgb)}
${buildCanvasPremultiplyHelper(includePremultiply)}
@vertex
fn spektralPresentationVertex(@builtin(vertex_index) index: u32) -> SpektralVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: SpektralVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = vec2f((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
	return out;
}

@fragment
fn spektralPresentationFragment(in: SpektralVertexOut) -> @location(0) vec4f {
	let spektralLinear = textureSample(spektralPresentationTexture, spektralPresentationSampler, in.uv);
	${presentationReturn}
}
`;
}
