import { buildRenderTargetSignature, resolveRenderTargetDefinitions } from './render-targets.js';
import { planRenderGraph, type RenderGraphPlan } from './render-graph.js';
import {
	buildPingPongShaderSourceWithMap,
	buildShaderSourceWithMap,
	formatShaderSourceLocation,
	type ShaderLineMap
} from './shader.js';
import {
	attachShaderCompilationDiagnostics,
	type ShaderCompilationDiagnostic,
	type ShaderCompilationRuntimeContext
} from './error-diagnostics.js';
import { attachMotionGPUErrorContext, createMotionGPUError } from './error-report.js';
import {
	assertTextureDimensionsWithinLimit,
	assertTextureFormat,
	getTextureMipLevelCount,
	normalizeTextureDefinitions,
	resolveTextureSamplingLayout,
	resolveTextureUpdateMode,
	resolveTextureSize,
	toTextureData
} from './textures.js';
import { packUniformsIntoFast } from './uniforms.js';
import { buildComputeShaderSourceWithMap } from './compute-shader.js';
import {
	createComputeBindGroupCache,
	type ComputeBindGroupCache
} from './compute-bindgroup-cache.js';
import {
	createComputeExternalResolutionState,
	resolveComputePassResources,
	type ComputeResourceResolverLimits,
	type ResolvedComputePassResources,
	type ResolvedComputeResource
} from './compute-resources.js';
import {
	ComputeSampledFallbackTexturePool,
	toComputeSampledFallbackClass
} from './compute-fallback-textures.js';
import { MaterialResourceRegistry, type RuntimeTextureResource } from './resource-registry.js';
import { normalizeStorageBufferDefinition } from './storage-buffers.js';
import { isManagedComputePass, isManagedFeedbackPass } from './pass-contract.js';
import {
	validateBuiltInRenderPassFormats,
	validatePresentationSourceFormat,
	validateRenderTargetFormats,
	validateWorkingFormat,
	resolvePresentationSourceSlot,
	type RenderTargetFormatMap
} from './render-format-validation.js';
import {
	assertFloatRenderableFormat,
	assertFloatSampledFormat,
	assertStorageTextureAccess,
	assertTextureFormatSupported
} from './format-capabilities.js';
import {
	buildCanvasConfiguration,
	buildPresentationShader,
	resolveColorPipeline,
	shouldConvertLinearToSrgb,
	type EffectiveDynamicRange
} from './color-pipeline.js';
import type {
	AnyPass,
	ComputePassLike,
	PingPongShaderPassLike,
	RenderPass,
	RenderPassInputSlot,
	RenderPassOutputSlot,
	RenderMode,
	RenderTarget,
	Renderer,
	RendererOptions,
	TextureSource,
	TextureUpdateMode,
	TextureValue
} from './types.js';

/**
 * Binding index for frame uniforms (`time`, `delta`, `resolution`).
 */
const FRAME_BINDING = 0;

/**
 * Binding index for material uniform buffer.
 */
const UNIFORM_BINDING = 1;

/**
 * First binding index used for texture sampler/texture pairs.
 */
const FIRST_TEXTURE_BINDING = 2;

/**
 * Runtime texture binding state associated with a single texture key.
 */
interface RuntimeTextureBinding {
	key: string;
	resource: RuntimeTextureResource;
	samplerBinding: number;
	textureBinding: number;
	fragmentVisible: boolean;
	sampler: GPUSampler;
	fallbackView: GPUTextureView;
	source: TextureSource | null;
	samplerType: GPUSamplerBindingType;
	effectiveFilter: GPUFilterMode;
	colorSpace: 'srgb' | 'linear';
	defaultColorSpace: 'srgb' | 'linear';
	flipY: boolean;
	defaultFlipY: boolean;
	generateMipmaps: boolean;
	defaultGenerateMipmaps: boolean;
	premultipliedAlpha: boolean;
	defaultPremultipliedAlpha: boolean;
	update: TextureUpdateMode;
	defaultUpdate?: TextureUpdateMode;
	lastToken: TextureValue;
	mipmapsDirty: boolean;
	feedbackViewActive: boolean;
}

/**
 * Runtime render target allocation metadata.
 */
interface RuntimeRenderTarget {
	texture: GPUTexture;
	view: GPUTextureView;
	width: number;
	height: number;
	format: GPUTextureFormat;
}

/**
 * Runtime ping-pong storage textures for a single logical target key.
 */
interface PingPongTexturePair {
	logicalId: string;
	format: GPUTextureFormat;
	width: number;
	height: number;
	textureA: GPUTexture;
	viewA: GPUTextureView;
	textureB: GPUTexture;
	viewB: GPUTextureView;
	readFromA: boolean;
}

/**
 * Runtime fragment-feedback textures for a single pass instance.
 */
interface PingPongShaderTexturePair {
	target: string;
	format: GPUTextureFormat;
	width: number;
	height: number;
	filter: GPUFilterMode;
	addressModeU: GPUAddressMode;
	addressModeV: GPUAddressMode;
	sampleType: GPUTextureSampleType;
	samplerType: GPUSamplerBindingType;
	effectiveFilter: GPUFilterMode;
	textureA: GPUTexture;
	viewA: GPUTextureView;
	textureB: GPUTexture;
	viewB: GPUTextureView;
	sampler: GPUSampler;
	previousBindGroupLayout: GPUBindGroupLayout | null;
	readABindGroup: GPUBindGroup | null;
	readBBindGroup: GPUBindGroup | null;
	needsClear: boolean;
}

/**
 * Cached pass properties used to validate render-graph cache correctness.
 */
interface RenderGraphPassSnapshot {
	pass: AnyPass;
	enabled: RenderPass['enabled'];
	needsSwap: RenderPass['needsSwap'];
	input: RenderPass['input'];
	output: RenderPass['output'];
	clear: RenderPass['clear'];
	preserve: RenderPass['preserve'];
	hasClearColor: boolean;
	clearColor0: number;
	clearColor1: number;
	clearColor2: number;
	clearColor3: number;
}

const DEFAULT_MAX_COMPUTE_WORKGROUPS_PER_DIMENSION = 65_535;
const COMPUTE_DISPATCH_AXES = ['x', 'y', 'z'] as const;
const DEFAULT_MAX_TEXTURE_DIMENSION_2D = 8192;

/**
 * Formats an invalid compute dispatch value for deterministic diagnostics.
 */
function formatComputeDispatchValue(value: unknown): string {
	if (value === undefined) {
		return 'undefined';
	}
	if (typeof value === 'number') {
		return Number.isNaN(value) ? 'NaN' : String(value);
	}
	if (typeof value === 'string') {
		return `"${value}"`;
	}

	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * Reads the compute workgroup limit with a fallback for partial or mocked devices.
 */
function getMaxComputeWorkgroupsPerDimension(device: GPUDevice): number {
	const max = (device.limits as GPUSupportedLimits | undefined)?.maxComputeWorkgroupsPerDimension;
	if (typeof max === 'number' && Number.isFinite(max) && max > 0) {
		return Math.floor(max);
	}

	return DEFAULT_MAX_COMPUTE_WORKGROUPS_PER_DIMENSION;
}

/**
 * Reads the device 2D texture limit with a fallback for partial or mocked devices.
 */
function getMaxTextureDimension2D(device: GPUDevice): number {
	const max = (device.limits as GPUSupportedLimits | undefined)?.maxTextureDimension2D;
	if (typeof max === 'number' && Number.isFinite(max) && max > 0) {
		return Math.floor(max);
	}

	return DEFAULT_MAX_TEXTURE_DIMENSION_2D;
}

/**
 * Checks a planned texture size against the active device before GPU allocation.
 */
function assertTextureAllocationSize(
	device: GPUDevice,
	width: number,
	height: number,
	label: string
): void {
	assertTextureDimensionsWithinLimit(width, height, getMaxTextureDimension2D(device), label);
}

/**
 * Reads a positive integer device limit or returns the supplied compatibility fallback.
 */
function getPositiveDeviceLimit(
	device: GPUDevice,
	name: keyof ComputeResourceResolverLimits,
	fallback: number
): number {
	const value = (device.limits as unknown as Record<string, unknown> | undefined)?.[name];
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}

/**
 * Captures the device limits used while validating compute resource bindings.
 */
function getComputeResourceResolverLimits(device: GPUDevice): ComputeResourceResolverLimits {
	return {
		maxBindingsPerBindGroup: getPositiveDeviceLimit(device, 'maxBindingsPerBindGroup', 1000),
		maxSampledTexturesPerShaderStage: getPositiveDeviceLimit(
			device,
			'maxSampledTexturesPerShaderStage',
			16
		),
		maxSamplersPerShaderStage: getPositiveDeviceLimit(device, 'maxSamplersPerShaderStage', 16),
		maxStorageTexturesPerShaderStage: getPositiveDeviceLimit(
			device,
			'maxStorageTexturesPerShaderStage',
			4
		),
		maxStorageBuffersPerShaderStage: getPositiveDeviceLimit(
			device,
			'maxStorageBuffersPerShaderStage',
			8
		),
		maxStorageBufferBindingSize: getPositiveDeviceLimit(
			device,
			'maxStorageBufferBindingSize',
			128 * 1024 * 1024
		)
	};
}

/**
 * Resolves and validates a three-axis dispatch tuple against the active device limit.
 */
function validateComputeDispatch(
	dispatch: unknown,
	maxWorkgroupsPerDimension: number,
	label: string
): [number, number, number] {
	if (!Array.isArray(dispatch)) {
		throw new Error(
			`${label} dispatch must resolve to an array [x, y, z], got ${formatComputeDispatchValue(dispatch)}.`
		);
	}

	const resolved = [dispatch[0], dispatch[1] ?? 1, dispatch[2] ?? 1] as const;
	const output: [number, number, number] = [1, 1, 1];

	for (let index = 0; index < COMPUTE_DISPATCH_AXES.length; index += 1) {
		const axis = COMPUTE_DISPATCH_AXES[index];
		const value = resolved[index];
		if (
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			!Number.isInteger(value) ||
			value < 1
		) {
			throw new Error(
				`${label} dispatch ${axis} must be a positive integer, got ${formatComputeDispatchValue(value)}.`
			);
		}
		if (value > maxWorkgroupsPerDimension) {
			throw new Error(
				`${label} dispatch ${axis} must be <= device.limits.maxComputeWorkgroupsPerDimension (${maxWorkgroupsPerDimension}), got ${value}.`
			);
		}
		output[index] = value;
	}

	return output;
}

/**
 * Returns sampler/texture binding slots for a texture index.
 */
function getTextureBindings(index: number): {
	samplerBinding: number;
	textureBinding: number;
} {
	const samplerBinding = FIRST_TEXTURE_BINDING + index * 2;
	return {
		samplerBinding,
		textureBinding: samplerBinding + 1
	};
}

/**
 * Resizes canvas backing store to match client size and DPR.
 */
function resizeCanvas(
	canvas: HTMLCanvasElement,
	dprInput: number,
	cssSize?: { width: number; height: number }
): { width: number; height: number } {
	const dpr = Number.isFinite(dprInput) && dprInput > 0 ? dprInput : 1;
	const rect = cssSize ? null : canvas.getBoundingClientRect();
	const cssWidth = Math.max(0, cssSize?.width ?? rect?.width ?? 0);
	const cssHeight = Math.max(0, cssSize?.height ?? rect?.height ?? 0);
	const width = Math.max(1, Math.floor((cssWidth || 1) * dpr));
	const height = Math.max(1, Math.floor((cssHeight || 1) * dpr));

	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	return { width, height };
}

/**
 * Throws when a shader module contains WGSL compilation errors.
 */
async function assertCompilation(
	module: GPUShaderModule,
	options?: {
		lineMap?: ShaderLineMap;
		fragmentSource?: string;
		computeSource?: string;
		includeSources?: Record<string, string>;
		defineBlockSource?: string;
		materialSource?: {
			component?: string;
			file?: string;
			line?: number;
			column?: number;
			functionName?: string;
		} | null;
		runtimeContext?: ShaderCompilationRuntimeContext;
		errorPrefix?: string;
		shaderStage?: 'fragment' | 'compute';
	}
): Promise<void> {
	const info = await module.getCompilationInfo();
	const errors = info.messages.filter((message: GPUCompilationMessage) => message.type === 'error');

	if (errors.length === 0) {
		return;
	}

	const diagnostics = errors.map((message: GPUCompilationMessage) => ({
		generatedLine: message.lineNum,
		message: message.message,
		linePos: message.linePos,
		lineLength: message.length,
		sourceLocation: options?.lineMap?.[message.lineNum] ?? null
	}));

	const summary = diagnostics
		.map((diagnostic) => {
			const sourceLabel = formatShaderSourceLocation(diagnostic.sourceLocation);
			const generatedLineLabel =
				diagnostic.generatedLine > 0 ? `generated WGSL line ${diagnostic.generatedLine}` : null;
			const contextLabel = [sourceLabel, generatedLineLabel].filter((value) => Boolean(value));
			if (contextLabel.length === 0) {
				return diagnostic.message;
			}

			return `[${contextLabel.join(' | ')}] ${diagnostic.message}`;
		})
		.join('\n');
	const prefix = options?.errorPrefix ?? 'WGSL compilation failed';
	const error = new Error(`${prefix}:\n${summary}`);
	throw attachShaderCompilationDiagnostics(error, {
		kind: 'shader-compilation',
		...(options?.shaderStage !== undefined ? { shaderStage: options.shaderStage } : {}),
		diagnostics,
		fragmentSource: options?.fragmentSource ?? '',
		...(options?.computeSource !== undefined ? { computeSource: options.computeSource } : {}),
		includeSources: options?.includeSources ?? {},
		...(options?.defineBlockSource !== undefined
			? { defineBlockSource: options.defineBlockSource }
			: {}),
		materialSource: options?.materialSource ?? null,
		...(options?.runtimeContext !== undefined ? { runtimeContext: options.runtimeContext } : {})
	});
}

function toSortedUniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

/**
 * Best-effort line extraction from a raw GPU error/exception message.
 *
 * Used only as a fallback when WebGPU's structured `getCompilationInfo()` and
 * `popErrorScope()` channels have no per-message line metadata — primarily to
 * keep test mocks that throw synchronously from `createComputePipeline()`
 * reproducible against the structured-diagnostics contract.
 */
function extractGeneratedLineFromComputeError(message: string): number | null {
	const lineMatch = message.match(/\bline\s+(\d+)\b/i);
	if (lineMatch) {
		const parsed = Number.parseInt(lineMatch[1] ?? '', 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}

	const colonMatch = message.match(/:(\d+):\d+/);
	if (colonMatch) {
		const parsed = Number.parseInt(colonMatch[1] ?? '', 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return null;
}

/**
 * Builds a compute compilation Error with structured diagnostics attached.
 */
function buildComputeCompilationError(input: {
	diagnostics: ShaderCompilationDiagnostic[];
	computeSource: string;
	runtimeContext: ShaderCompilationRuntimeContext;
}): Error {
	const summary = input.diagnostics
		.map((diagnostic) => {
			const sourceLabel = formatShaderSourceLocation(diagnostic.sourceLocation);
			const generatedLineLabel =
				diagnostic.generatedLine > 0 ? `generated WGSL line ${diagnostic.generatedLine}` : null;
			const contextLabel = [sourceLabel, generatedLineLabel].filter((value) => Boolean(value));
			if (contextLabel.length === 0) {
				return diagnostic.message;
			}

			return `[${contextLabel.join(' | ')}] ${diagnostic.message}`;
		})
		.join('\n');

	const error = new Error(`Compute shader compilation failed:\n${summary}`);
	return attachShaderCompilationDiagnostics(error, {
		kind: 'shader-compilation',
		shaderStage: 'compute',
		diagnostics: input.diagnostics,
		fragmentSource: '',
		computeSource: input.computeSource,
		includeSources: {},
		materialSource: null,
		runtimeContext: input.runtimeContext
	});
}

/**
 * Fallback compute-compilation error builder used when the synchronous
 * `createShaderModule` / `createComputePipeline` path itself throws — there is
 * no compilation info or popped scope to inspect, so we extract whatever line
 * hint we can from the raw exception message.
 */
function toComputeCompilationError(input: {
	error: unknown;
	lineMap: ShaderLineMap;
	computeSource: string;
	runtimeContext: ShaderCompilationRuntimeContext;
}): Error {
	const baseError =
		input.error instanceof Error ? input.error : new Error(String(input.error ?? 'Unknown error'));
	const generatedLine = extractGeneratedLineFromComputeError(baseError.message) ?? 0;
	const sourceLocation = generatedLine > 0 ? (input.lineMap[generatedLine] ?? null) : null;
	return buildComputeCompilationError({
		diagnostics: [
			{
				generatedLine,
				message: baseError.message,
				sourceLocation
			}
		],
		computeSource: input.computeSource,
		runtimeContext: input.runtimeContext
	});
}

/**
 * Awaits the async outputs of a compute shader module + pipeline creation
 * sequence (compilation info + popped validation scope) and, if either reveals
 * an error, returns a fully-attributed compute compilation Error. Returns
 * `null` when both channels are clean.
 */
async function assertComputeCompilationAsync(input: {
	module: GPUShaderModule;
	validationScope: Promise<GPUError | null>;
	lineMap: ShaderLineMap;
	computeSource: string;
	runtimeContext: ShaderCompilationRuntimeContext;
}): Promise<Error | null> {
	let compilationMessages: GPUCompilationMessage[] = [];
	try {
		const info = await input.module.getCompilationInfo();
		compilationMessages = info.messages.filter(
			(message: GPUCompilationMessage) => message.type === 'error'
		);
	} catch {
		// If the runtime cannot report compilation info, fall through to
		// validation scope or treat as clean.
	}

	const validationError = await input.validationScope.catch(() => null);

	if (compilationMessages.length === 0 && !validationError) {
		return null;
	}

	const diagnostics =
		compilationMessages.length > 0
			? compilationMessages.map((message: GPUCompilationMessage) => ({
					generatedLine: message.lineNum,
					message: message.message,
					linePos: message.linePos,
					lineLength: message.length,
					sourceLocation: input.lineMap[message.lineNum] ?? null
				}))
			: [
					{
						generatedLine: 0,
						message: validationError!.message,
						sourceLocation: null
					}
				];

	return buildComputeCompilationError({
		diagnostics,
		computeSource: input.computeSource,
		runtimeContext: input.runtimeContext
	});
}

/**
 * Summarizes enabled pass inputs and outputs for shader compilation diagnostics.
 */
function buildPassGraphSnapshot(
	passes: AnyPass[] | undefined
): NonNullable<ShaderCompilationRuntimeContext['passGraph']> {
	const declaredPasses = passes ?? [];
	let enabledPassCount = 0;
	const inputs: string[] = [];
	const outputs: string[] = [];

	for (const pass of declaredPasses) {
		if (pass.enabled === false) {
			continue;
		}

		enabledPassCount += 1;
		if (isManagedComputePass(pass)) {
			continue;
		}
		if (isManagedFeedbackPass(pass)) {
			continue;
		}
		const rp = pass as RenderPass;
		const needsSwap = rp.needsSwap ?? true;
		const input = rp.input ?? 'source';
		const output = rp.output ?? (needsSwap ? 'target' : 'source');
		inputs.push(input);
		outputs.push(output);
	}

	return {
		passCount: declaredPasses.length,
		enabledPassCount,
		inputs: toSortedUniqueStrings(inputs),
		outputs: toSortedUniqueStrings(outputs)
	};
}

/**
 * Captures render targets and pass topology at shader compilation time.
 */
function buildShaderCompilationRuntimeContext(
	options: RendererOptions
): ShaderCompilationRuntimeContext {
	const passList = options.getPasses?.() ?? options.passes;
	const renderTargetMap = options.getRenderTargets?.() ?? options.renderTargets;

	return {
		...(options.materialSignature ? { materialSignature: options.materialSignature } : {}),
		passGraph: buildPassGraphSnapshot(passList),
		activeRenderTargets: Object.keys(renderTargetMap ?? {}).sort((a, b) => a.localeCompare(b))
	};
}

/**
 * Creates typed descriptor for `copyExternalImageToTexture`.
 */
function createExternalCopySource(
	source: CanvasImageSource,
	options: { flipY?: boolean; premultipliedAlpha?: boolean }
): GPUCopyExternalImageSourceInfo {
	const descriptor = {
		source,
		...(options.flipY ? { flipY: true } : {}),
		...(options.premultipliedAlpha ? { premultipliedAlpha: true } : {})
	};

	return descriptor as GPUCopyExternalImageSourceInfo;
}

/**
 * Uploads source content to the base GPU texture level.
 */
function uploadTextureBaseLevel(
	device: GPUDevice,
	texture: GPUTexture,
	uploadOptions: { flipY: boolean; premultipliedAlpha: boolean },
	source: TextureSource,
	width: number,
	height: number
): void {
	device.queue.copyExternalImageToTexture(
		createExternalCopySource(source, {
			flipY: uploadOptions.flipY,
			premultipliedAlpha: uploadOptions.premultipliedAlpha
		}),
		{ texture, mipLevel: 0 },
		{ width, height, depthOrArrayLayers: 1 }
	);
}

const GPU_MIPMAP_SHADER = `
struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);
	let position = positions[vertexIndex];
	var out: VertexOutput;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = position * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
	return out;
}

@group(0) @binding(0) var mipSampler: sampler;
@group(0) @binding(1) var mipSource: texture_2d<f32>;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
	return textureSample(mipSource, mipSampler, in.uv);
}
`;

interface GpuMipmapGenerator {
	generate: (input: {
		commandEncoder: GPUCommandEncoder;
		texture: GPUTexture;
		format: GPUTextureFormat;
		mipLevelCount: number;
	}) => void;
}

function createGpuMipmapGenerator(device: GPUDevice): GpuMipmapGenerator {
	let sampler: GPUSampler | null = null;
	let shaderModule: GPUShaderModule | null = null;
	let bindGroupLayout: GPUBindGroupLayout | null = null;
	let pipelineLayout: GPUPipelineLayout | null = null;
	const pipelineByFormat = new Map<GPUTextureFormat, GPURenderPipeline>();

	const ensureBindGroupLayout = (): GPUBindGroupLayout => {
		if (!bindGroupLayout) {
			bindGroupLayout = device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: { type: 'filtering' }
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						texture: { sampleType: 'float' }
					}
				]
			});
		}

		return bindGroupLayout;
	};

	const ensurePipeline = (format: GPUTextureFormat): GPURenderPipeline => {
		const cached = pipelineByFormat.get(format);
		if (cached) {
			return cached;
		}

		const layout = ensureBindGroupLayout();
		shaderModule ??= device.createShaderModule({ code: GPU_MIPMAP_SHADER });
		pipelineLayout ??= device.createPipelineLayout({
			bindGroupLayouts: [layout]
		});
		const pipeline = device.createRenderPipeline({
			layout: pipelineLayout,
			vertex: {
				module: shaderModule,
				entryPoint: 'vertexMain'
			},
			fragment: {
				module: shaderModule,
				entryPoint: 'fragmentMain',
				targets: [{ format }]
			},
			primitive: {
				topology: 'triangle-list'
			}
		});
		pipelineByFormat.set(format, pipeline);
		return pipeline;
	};

	return {
		generate: ({ commandEncoder, texture, format, mipLevelCount }) => {
			if (mipLevelCount <= 1) {
				return;
			}

			sampler ??= device.createSampler({
				minFilter: 'linear',
				magFilter: 'linear'
			});
			const layout = ensureBindGroupLayout();
			const pipeline = ensurePipeline(format);

			for (let level = 1; level < mipLevelCount; level += 1) {
				const sourceView = texture.createView({
					baseMipLevel: level - 1,
					mipLevelCount: 1
				});
				const targetView = texture.createView({
					baseMipLevel: level,
					mipLevelCount: 1
				});
				const bindGroup = device.createBindGroup({
					layout,
					entries: [
						{ binding: 0, resource: sampler },
						{ binding: 1, resource: sourceView }
					]
				});
				const pass = commandEncoder.beginRenderPass({
					colorAttachments: [
						{
							view: targetView,
							clearValue: { r: 0, g: 0, b: 0, a: 0 },
							loadOp: 'clear',
							storeOp: 'store'
						}
					]
				});
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, bindGroup);
				pass.draw(3);
				pass.end();
			}
		}
	};
}

function markTextureMipmapsDirty(
	binding: Pick<RuntimeTextureBinding, 'generateMipmaps' | 'mipmapsDirty'>,
	mipLevelCount: number
): void {
	if (binding.generateMipmaps && mipLevelCount > 1) {
		binding.mipmapsDirty = true;
	} else {
		binding.mipmapsDirty = false;
	}
}

/**
 * Creates bind group layout entries for frame/uniform buffers plus texture bindings.
 */
function createBindGroupLayoutEntries(
	textureBindings: RuntimeTextureBinding[]
): GPUBindGroupLayoutEntry[] {
	const entries: GPUBindGroupLayoutEntry[] = [
		{
			binding: FRAME_BINDING,
			visibility: GPUShaderStage.FRAGMENT,
			buffer: { type: 'uniform', minBindingSize: 16 }
		},
		{
			binding: UNIFORM_BINDING,
			visibility: GPUShaderStage.FRAGMENT,
			buffer: { type: 'uniform' }
		}
	];

	for (const binding of textureBindings) {
		entries.push({
			binding: binding.samplerBinding,
			visibility: GPUShaderStage.FRAGMENT,
			sampler: { type: binding.samplerType }
		});

		entries.push({
			binding: binding.textureBinding,
			visibility: GPUShaderStage.FRAGMENT,
			texture: {
				sampleType: binding.resource.sampleType,
				viewDimension: '2d',
				multisampled: false
			}
		});
	}

	return entries;
}

/**
 * Maximum gap (in floats) between two dirty ranges that triggers merge.
 *
 * Set to 4 (16 bytes) which covers one vec4f alignment slot.
 */
const DIRTY_RANGE_MERGE_GAP = 4;

/**
 * Shared empty result returned when no float values differ between snapshots.
 *
 * Avoids allocating a new `[]` on every clean frame (the common steady-state
 * case). Callers must not mutate this reference.
 */
const EMPTY_DIRTY_RANGES: ReadonlyArray<{ start: number; count: number }> = [];

/**
 * Computes dirty float ranges between two uniform snapshots.
 *
 * Adjacent dirty ranges separated by a gap smaller than or equal to
 * {@link DIRTY_RANGE_MERGE_GAP} are merged to reduce `writeBuffer` calls.
 *
 * Returns a shared empty array reference when the buffers are identical —
 * callers must not mutate the returned array.
 */
export function findDirtyFloatRanges(
	previous: Float32Array,
	next: Float32Array,
	mergeGapThreshold = DIRTY_RANGE_MERGE_GAP
): ReadonlyArray<{ start: number; count: number }> {
	let start = -1;
	let rangeCount = 0;
	const ranges: Array<{ start: number; count: number }> = [];

	for (let index = 0; index < next.length; index += 1) {
		if (previous[index] !== next[index]) {
			if (start === -1) {
				start = index;
			}
			continue;
		}

		if (start !== -1) {
			ranges.push({ start, count: index - start });
			rangeCount += 1;
			start = -1;
		}
	}

	if (start !== -1) {
		ranges.push({ start, count: next.length - start });
		rangeCount += 1;
	}

	if (rangeCount === 0) {
		// Most common case in steady-state animations: no dirty ranges.
		// Return the shared sentinel to avoid a per-frame heap allocation.
		return EMPTY_DIRTY_RANGES;
	}

	if (rangeCount <= 1) {
		return ranges;
	}

	const merged: Array<{ start: number; count: number }> = [ranges[0]!];
	for (let index = 1; index < rangeCount; index += 1) {
		const prev = merged[merged.length - 1]!;
		const curr = ranges[index]!;
		const gap = curr.start - (prev.start + prev.count);

		if (gap <= mergeGapThreshold) {
			prev.count = curr.start + curr.count - prev.start;
		} else {
			merged.push(curr);
		}
	}

	return merged;
}

/**
 * Allocates a render target texture with usage flags suitable for passes/blits.
 */
function createRenderTexture(
	device: GPUDevice,
	width: number,
	height: number,
	format: GPUTextureFormat
): RuntimeRenderTarget {
	assertTextureFormat(format, 'Render target');
	assertTextureAllocationSize(device, width, height, 'Render target');
	const texture = device.createTexture({
		size: { width, height, depthOrArrayLayers: 1 },
		format,
		usage:
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.RENDER_ATTACHMENT |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.COPY_SRC
	});

	return {
		texture,
		view: texture.createView(),
		width,
		height,
		format
	};
}

/**
 * Destroys a render target texture if present.
 */
function destroyRenderTexture(target: RuntimeRenderTarget | null): void {
	target?.texture.destroy();
}

function toClearValue(color: [number, number, number, number]): GPUColorDict {
	return {
		r: color[0],
		g: color[1],
		b: color[2],
		a: color[3]
	};
}

function toPremultipliedCanvasClearValue(color: [number, number, number, number]): GPUColorDict {
	const alpha = Math.min(Math.max(color[3], 0), 1);
	return {
		r: color[0] * alpha,
		g: color[1] * alpha,
		b: color[2] * alpha,
		a: alpha
	};
}

/**
 * Creates the WebGPU renderer used by `FragCanvas`.
 *
 * @param options - Renderer creation options resolved from material/context state.
 * @returns Renderer instance with `render` and `destroy`.
 * @throws {Error} On WebGPU unavailability, shader compilation issues, or runtime setup failures.
 */
export async function createRenderer(options: RendererOptions): Promise<Renderer> {
	if (!navigator.gpu) {
		throw new Error('WebGPU is not available in this browser');
	}

	const context = options.canvas.getContext('webgpu') as GPUCanvasContext | null;
	if (!context) {
		throw new Error('Canvas does not support webgpu context');
	}

	const preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
	const colorPipeline = resolveColorPipeline({
		color: options.color,
		preferredCanvasFormat
	});
	const workingFormat = colorPipeline.workingFormat;
	const scenePipelineFormat = colorPipeline.requiresPresentationPass
		? workingFormat
		: colorPipeline.canvasFormat;
	let effectiveCanvasFormat = colorPipeline.canvasFormat;
	let effectiveDynamicRange: EffectiveDynamicRange =
		colorPipeline.dynamicRange === 'auto' ? 'hdr' : colorPipeline.dynamicRange;
	const adapter = await navigator.gpu.requestAdapter(options.adapterOptions);
	if (!adapter) {
		throw new Error('Unable to acquire WebGPU adapter');
	}

	const device = await adapter.requestDevice(options.deviceDescriptor);
	const maxComputeWorkgroupsPerDimension = getMaxComputeWorkgroupsPerDimension(device);
	let isDestroyed = false;
	let deviceLostMessage: string | null = null;
	const uncapturedErrorMessages: string[] = [];
	const initializationCleanups: Array<() => void> = [];
	let acceptInitializationCleanups = true;
	const MAX_UNCAPTURED_ERROR_MESSAGES = 12;
	const destroyDevice = (): void => {
		try {
			device.destroy();
		} catch {
			// Best-effort GPUDevice teardown.
		}
	};

	const isDerivativeUncapturedMessage = (message: string): boolean => {
		const normalized = message.toLowerCase();
		// "is invalid due to a previous error" is the canonical Dawn/WebGPU
		// cascade marker emitted from setPipeline / commandEncoder.finish /
		// queue.submit when a prior shader/pipeline failed validation. The
		// authoritative error already lives in our compute-pipeline error cache
		// (or in another uncaptured message), so suppress these from the user
		// channel — they only add noise like "[Invalid CommandBuffer] is
		// invalid due to a previous error".
		return (
			normalized.includes('is invalid due to a previous error') ||
			normalized.includes('too many warnings, no more warnings will be reported')
		);
	};

	const consumeUncapturedErrorMessage = (): string | null => {
		if (uncapturedErrorMessages.length === 0) {
			return null;
		}

		const uniqueMessages: string[] = [];
		for (const message of uncapturedErrorMessages) {
			if (!uniqueMessages.includes(message)) {
				uniqueMessages.push(message);
			}
		}
		uncapturedErrorMessages.length = 0;

		const primaryIndex = uniqueMessages.findIndex(
			(message) => !isDerivativeUncapturedMessage(message)
		);
		// When every queued message is derivative cascade noise we have nothing
		// of substance to surface — return null so the host can fall through to
		// the structured diagnostics path (e.g. a cached compute compilation
		// error) instead of throwing an unhelpful "[Invalid X] is invalid due
		// to a previous error".
		if (primaryIndex === -1) {
			return null;
		}
		const primaryMessage = uniqueMessages[primaryIndex];
		if (!primaryMessage) {
			return null;
		}

		const relatedMessages = uniqueMessages.filter((_, index) => index !== primaryIndex);
		if (relatedMessages.length === 0) {
			return `WebGPU uncaptured error: ${primaryMessage}`;
		}

		return [
			`WebGPU uncaptured error: ${primaryMessage}`,
			`Additional uncaptured WebGPU errors (${relatedMessages.length}):`,
			...relatedMessages.map((message, index) => `[${index + 1}] ${message}`)
		].join('\n');
	};

	const registerInitializationCleanup = (cleanup: () => void): void => {
		if (!acceptInitializationCleanups) {
			return;
		}
		options.__onInitializationCleanupRegistered?.();
		initializationCleanups.push(cleanup);
	};

	const runInitializationCleanups = (): void => {
		for (let index = initializationCleanups.length - 1; index >= 0; index -= 1) {
			try {
				initializationCleanups[index]?.();
			} catch {
				// Best-effort cleanup on failed renderer initialization.
			}
		}
		initializationCleanups.length = 0;
	};

	void device.lost.then((info) => {
		if (isDestroyed) {
			return;
		}

		const reason = info.reason ? ` (${info.reason})` : '';
		const details = info.message?.trim();
		deviceLostMessage = details
			? `WebGPU device lost: ${details}${reason}`
			: `WebGPU device lost${reason}`;
		options.requestRender?.();
	});

	const handleUncapturedError = (event: GPUUncapturedErrorEvent): void => {
		if (isDestroyed) {
			return;
		}

		const message =
			event.error instanceof Error
				? event.error.message
				: String((event.error as { message?: string })?.message ?? event.error);
		const trimmedMessage = message.trim();
		const normalizedMessage =
			trimmedMessage.length > 0 ? trimmedMessage : 'Unknown GPU validation error';
		const lastMessage = uncapturedErrorMessages[uncapturedErrorMessages.length - 1];
		if (lastMessage === normalizedMessage) {
			return;
		}

		uncapturedErrorMessages.push(normalizedMessage);
		if (uncapturedErrorMessages.length > MAX_UNCAPTURED_ERROR_MESSAGES) {
			uncapturedErrorMessages.splice(
				0,
				uncapturedErrorMessages.length - MAX_UNCAPTURED_ERROR_MESSAGES
			);
		}
		options.requestRender?.();
	};

	device.addEventListener('uncapturederror', handleUncapturedError);
	try {
		validateWorkingFormat(workingFormat, device.features);
		const presentationSamplingLayout = resolveTextureSamplingLayout({
			format: workingFormat,
			filter: 'linear',
			deviceFeatures: device.features
		});
		const initialRenderTargetFormats = validateRenderTargetFormats(
			options.getRenderTargets ? undefined : options.renderTargets,
			workingFormat,
			device.features
		);
		if (!options.getPasses && !options.getRenderTargets) {
			const initialPasses = options.passes ?? [];
			validateBuiltInRenderPassFormats({
				passes: initialPasses,
				workingFormat,
				namedFormats: initialRenderTargetFormats,
				deviceFeatures: device.features
			});
			const presentationSourceSlot = resolvePresentationSourceSlot(initialPasses);
			if (presentationSourceSlot !== null) {
				validatePresentationSourceFormat({
					slot: presentationSourceSlot,
					workingFormat,
					namedFormats: initialRenderTargetFormats,
					deviceFeatures: device.features,
					requiresFilterableInput: presentationSamplingLayout.samplerType === 'filtering'
				});
			}
		}
		const runtimeContext = buildShaderCompilationRuntimeContext(options);
		const convertLinearToSrgb =
			!colorPipeline.requiresPresentationPass &&
			shouldConvertLinearToSrgb(colorPipeline.outputEncoding, colorPipeline.canvasFormat, 'sdr');
		const fragmentTextureKeys = options.textureKeys.filter(
			(key) => options.textureDefinitions[key]?.fragmentVisible !== false
		);
		const buildSceneShader = (premultiplyOutputAlpha: boolean) =>
			buildShaderSourceWithMap(options.fragmentWgsl, options.uniformLayout, fragmentTextureKeys, {
				convertLinearToSrgb,
				premultiplyOutputAlpha,
				fragmentLineMap: options.fragmentLineMap,
				...(options.storageBufferKeys !== undefined
					? { storageBufferKeys: options.storageBufferKeys }
					: {}),
				...(options.storageBufferDefinitions !== undefined
					? { storageBufferDefinitions: options.storageBufferDefinitions }
					: {})
			});
		const builtShader = buildSceneShader(false);
		const shaderModule = device.createShaderModule({ code: builtShader.code });
		const assertSceneShaderCompilation = (
			module: GPUShaderModule,
			builtSource: typeof builtShader
		) =>
			assertCompilation(module, {
				lineMap: builtSource.lineMap,
				fragmentSource: options.fragmentSource,
				includeSources: options.includeSources,
				...(options.defineBlockSource !== undefined
					? { defineBlockSource: options.defineBlockSource }
					: {}),
				materialSource: options.materialSource ?? null,
				runtimeContext
			});
		await assertSceneShaderCompilation(shaderModule, builtShader);
		const builtDirectCanvasShader = !colorPipeline.requiresPresentationPass
			? buildSceneShader(true)
			: null;
		const directCanvasShaderModule = builtDirectCanvasShader
			? device.createShaderModule({ code: builtDirectCanvasShader.code })
			: null;
		if (directCanvasShaderModule && builtDirectCanvasShader) {
			await assertSceneShaderCompilation(directCanvasShaderModule, builtDirectCanvasShader);
		}

		const normalizedTextureDefinitions = normalizeTextureDefinitions(
			options.textureDefinitions,
			options.textureKeys
		);
		for (const key of options.textureKeys) {
			const definition = normalizedTextureDefinitions[key];
			if (!definition) continue;
			assertTextureFormatSupported({
				format: definition.format,
				target: key,
				pass: 'Material texture allocation',
				deviceFeatures: device.features
			});
			if (definition.fragmentVisible) {
				assertFloatSampledFormat({
					format: definition.format,
					target: key,
					pass: 'Material fragment texture',
					deviceFeatures: device.features
				});
			}
			if (definition.storage) {
				assertStorageTextureAccess({
					format: definition.format,
					target: key,
					pass: 'Material storage texture allocation',
					access: 'write-only',
					deviceFeatures: device.features
				});
			}
		}
		const storageBufferKeys = options.storageBufferKeys ?? [];
		const storageBufferDefinitions = options.storageBufferDefinitions ?? {};
		const storageTextureKeys = options.storageTextureKeys ?? [];
		const storageTextureKeySet = new Set(storageTextureKeys);
		const resourceRegistry = new MaterialResourceRegistry();
		const sampledFallbackPool = new ComputeSampledFallbackTexturePool(device);
		registerInitializationCleanup(() => sampledFallbackPool.destroy());
		const sampledFallbackUsage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
		const fragmentTextureIndexByKey = new Map(
			fragmentTextureKeys.map((key, index) => [key, index] as const)
		);
		const textureBindings = options.textureKeys.map((key): RuntimeTextureBinding => {
			const config = normalizedTextureDefinitions[key];
			if (!config) {
				throw new Error(`Missing texture definition for "${key}"`);
			}

			const fragmentTextureIndex = fragmentTextureIndexByKey.get(key);
			const fragmentVisible = fragmentTextureIndex !== undefined;
			const { samplerBinding, textureBinding } = getTextureBindings(fragmentTextureIndex ?? 0);
			const samplingLayout = resolveTextureSamplingLayout({
				format: config.format,
				filter: config.filter,
				deviceFeatures: device.features
			});
			if (config.generateMipmaps && samplingLayout.sampleType !== 'float') {
				throw new Error(
					`Texture "${key}" with format "${config.format}" cannot generate mipmaps because it is not filterable on this device.`
				);
			}
			const sampler = device.createSampler({
				magFilter: samplingLayout.effectiveFilter,
				minFilter: samplingLayout.effectiveFilter,
				mipmapFilter: config.generateMipmaps ? samplingLayout.effectiveFilter : 'nearest',
				addressModeU: config.addressModeU,
				addressModeV: config.addressModeV,
				maxAnisotropy:
					samplingLayout.samplerType === 'filtering' && samplingLayout.effectiveFilter === 'linear'
						? config.anisotropy
						: 1
			});
			let fallbackView: GPUTextureView;
			let resource: RuntimeTextureResource;
			if (config.storage) {
				if (!config.width || !config.height) {
					throw new Error(`Storage texture "${key}" requires explicit positive width and height.`);
				}
				assertTextureAllocationSize(device, config.width, config.height, `Texture "${key}"`);
				const storageUsage =
					GPUTextureUsage.TEXTURE_BINDING |
					GPUTextureUsage.STORAGE_BINDING |
					GPUTextureUsage.COPY_DST;
				const storageTexture = device.createTexture({
					size: { width: config.width, height: config.height, depthOrArrayLayers: 1 },
					format: config.format,
					usage: storageUsage
				});
				registerInitializationCleanup(() => storageTexture.destroy());
				fallbackView = storageTexture.createView();
				resource = resourceRegistry.registerTexture({
					logicalId: key,
					ownedTexture: storageTexture,
					storageView: fallbackView,
					sampledView: fallbackView,
					format: config.format,
					width: config.width,
					height: config.height,
					mipLevelCount: 1,
					sampleType: samplingLayout.sampleType,
					usage: storageUsage
				});
			} else {
				fallbackView = sampledFallbackPool.get(
					toComputeSampledFallbackClass(samplingLayout.sampleType)
				).view;
				resource = resourceRegistry.registerTexture({
					logicalId: key,
					sampledView: fallbackView,
					format: config.format,
					mipLevelCount: 1,
					sampleType: samplingLayout.sampleType,
					usage: sampledFallbackUsage
				});
			}

			const runtimeBinding: RuntimeTextureBinding = {
				key,
				resource,
				samplerBinding,
				textureBinding,
				fragmentVisible,
				sampler,
				fallbackView,
				source: null,
				samplerType: samplingLayout.samplerType,
				effectiveFilter: samplingLayout.effectiveFilter,
				colorSpace: config.colorSpace,
				defaultColorSpace: config.colorSpace,
				flipY: config.flipY,
				defaultFlipY: config.flipY,
				generateMipmaps: config.generateMipmaps,
				defaultGenerateMipmaps: config.generateMipmaps,
				premultipliedAlpha: config.premultipliedAlpha,
				defaultPremultipliedAlpha: config.premultipliedAlpha,
				update: config.update ?? 'once',
				lastToken: null,
				mipmapsDirty: false,
				feedbackViewActive: false
			};

			if (config.update !== undefined) {
				runtimeBinding.defaultUpdate = config.update;
			}

			return runtimeBinding;
		});
		const textureBindingByKey = new Map(textureBindings.map((binding) => [binding.key, binding]));
		const fragmentTextureBindings = textureBindings.filter((binding) => binding.fragmentVisible);

		const bindGroupLayout = device.createBindGroupLayout({
			entries: createBindGroupLayoutEntries(fragmentTextureBindings)
		});
		const fragmentStorageBindGroupLayout =
			storageBufferKeys.length > 0
				? device.createBindGroupLayout({
						entries: storageBufferKeys.map((_, index) => ({
							binding: index,
							visibility: GPUShaderStage.FRAGMENT,
							buffer: { type: 'read-only-storage' as GPUBufferBindingType }
						}))
					})
				: null;
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: fragmentStorageBindGroupLayout
				? [bindGroupLayout, fragmentStorageBindGroupLayout]
				: [bindGroupLayout]
		});

		const pipeline = device.createRenderPipeline({
			layout: pipelineLayout,
			vertex: {
				module: shaderModule,
				entryPoint: 'motiongpuVertex'
			},
			fragment: {
				module: shaderModule,
				entryPoint: 'motiongpuFragmentMain',
				targets: [{ format: scenePipelineFormat }]
			},
			primitive: {
				topology: 'triangle-list'
			}
		});
		const directCanvasPipeline = directCanvasShaderModule
			? device.createRenderPipeline({
					layout: pipelineLayout,
					vertex: {
						module: directCanvasShaderModule,
						entryPoint: 'motiongpuVertex'
					},
					fragment: {
						module: directCanvasShaderModule,
						entryPoint: 'motiongpuFragmentMain',
						targets: [{ format: colorPipeline.canvasFormat }]
					},
					primitive: {
						topology: 'triangle-list'
					}
				})
			: null;

		const presentationBindGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: presentationSamplingLayout.samplerType }
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						sampleType: presentationSamplingLayout.sampleType,
						viewDimension: '2d',
						multisampled: false
					}
				}
			]
		});
		const presentationPipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [presentationBindGroupLayout]
		});
		const presentationPipelines = new Map<string, GPURenderPipeline>();
		const buildPresentationPipelineKey = (
			canvasFormat: GPUTextureFormat,
			dynamicRange: EffectiveDynamicRange,
			applyFinalTransform: boolean,
			premultiplyAlpha: boolean
		): string => {
			return `${canvasFormat}|${dynamicRange}|${applyFinalTransform}|${premultiplyAlpha}`;
		};
		const createPresentationPipeline = async (
			canvasFormat: GPUTextureFormat,
			dynamicRange: EffectiveDynamicRange,
			applyFinalTransform: boolean,
			premultiplyAlpha: boolean
		): Promise<void> => {
			const key = buildPresentationPipelineKey(
				canvasFormat,
				dynamicRange,
				applyFinalTransform,
				premultiplyAlpha
			);
			if (presentationPipelines.has(key)) {
				return;
			}

			const convertPresentationLinearToSrgb =
				applyFinalTransform &&
				shouldConvertLinearToSrgb(colorPipeline.outputEncoding, canvasFormat, dynamicRange);
			const presentationShaderModule = device.createShaderModule({
				code: buildPresentationShader({
					toneMapping: applyFinalTransform ? colorPipeline.toneMapping : 'none',
					convertLinearToSrgb: convertPresentationLinearToSrgb,
					dynamicRange,
					premultiplyAlpha
				})
			});
			await assertCompilation(presentationShaderModule);
			presentationPipelines.set(
				key,
				device.createRenderPipeline({
					layout: presentationPipelineLayout,
					vertex: {
						module: presentationShaderModule,
						entryPoint: 'motiongpuPresentationVertex'
					},
					fragment: {
						module: presentationShaderModule,
						entryPoint: 'motiongpuPresentationFragment',
						targets: [{ format: canvasFormat }]
					},
					primitive: {
						topology: 'triangle-list'
					}
				})
			);
		};
		await createPresentationPipeline(
			colorPipeline.canvasFormat,
			colorPipeline.dynamicRange === 'auto' ? 'hdr' : colorPipeline.dynamicRange,
			colorPipeline.requiresPresentationPass,
			true
		);
		if (colorPipeline.dynamicRange === 'auto') {
			await createPresentationPipeline(
				colorPipeline.fallbackCanvasFormat,
				'sdr',
				colorPipeline.requiresPresentationPass,
				true
			);
		}
		const presentationSampler = device.createSampler({
			magFilter: presentationSamplingLayout.effectiveFilter,
			minFilter: presentationSamplingLayout.effectiveFilter,
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});
		let presentationBindGroupByView = new WeakMap<GPUTextureView, GPUBindGroup>();

		// ── Storage buffer allocation ────────────────────────────────────────
		const pingPongTexturePairs = new Map<ComputePassLike, PingPongTexturePair>();
		const pingPongShaderTexturePairs = new Map<PingPongShaderPassLike, PingPongShaderTexturePair>();

		for (const key of storageBufferKeys) {
			const definition = storageBufferDefinitions[key];
			if (!definition) {
				continue;
			}
			const normalized = normalizeStorageBufferDefinition(definition);
			const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
			const buffer = device.createBuffer({
				size: normalized.size,
				usage
			});
			registerInitializationCleanup(() => {
				buffer.destroy();
			});
			if (definition.initialData !== undefined && definition.initialData.byteLength > 0) {
				const data = definition.initialData;
				device.queue.writeBuffer(
					buffer,
					0,
					data.buffer as ArrayBuffer,
					data.byteOffset,
					data.byteLength
				);
			}
			resourceRegistry.registerStorageBuffer({
				logicalId: key,
				buffer,
				size: normalized.size,
				wgslType: normalized.type,
				access: normalized.access,
				usage
			});
		}
		const fragmentStorageBindGroup =
			fragmentStorageBindGroupLayout && storageBufferKeys.length > 0
				? device.createBindGroup({
						layout: fragmentStorageBindGroupLayout,
						entries: storageBufferKeys.map((key, index) => {
							const resource = resourceRegistry.requireStorageBuffer(key);
							return { binding: index, resource: { buffer: resource.buffer } };
						})
					})
				: null;

		const ensurePingPongTexturePair = (
			pass: ComputePassLike,
			logicalId: string
		): PingPongTexturePair => {
			const existing = pingPongTexturePairs.get(pass);
			if (existing && existing.logicalId === logicalId) {
				return existing;
			}
			if (existing) {
				existing.textureA.destroy();
				existing.textureB.destroy();
				pingPongTexturePairs.delete(pass);
			}

			const config = normalizedTextureDefinitions[logicalId];
			if (!config || !config.storage) {
				throw new Error(
					`PingPongComputePass resource "${logicalId}" must reference a texture declared with storage:true.`
				);
			}
			if (!config.width || !config.height) {
				throw new Error(
					`PingPongComputePass resource "${logicalId}" requires explicit texture width and height.`
				);
			}
			assertTextureAllocationSize(
				device,
				config.width,
				config.height,
				`PingPongComputePass resource "${logicalId}"`
			);

			const usage =
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.STORAGE_BINDING |
				GPUTextureUsage.COPY_DST;
			const textureA = device.createTexture({
				size: { width: config.width, height: config.height, depthOrArrayLayers: 1 },
				format: config.format,
				usage
			});
			const textureB = device.createTexture({
				size: { width: config.width, height: config.height, depthOrArrayLayers: 1 },
				format: config.format,
				usage
			});
			registerInitializationCleanup(() => {
				textureA.destroy();
			});
			registerInitializationCleanup(() => {
				textureB.destroy();
			});

			const pair: PingPongTexturePair = {
				logicalId,
				format: config.format as GPUTextureFormat,
				width: config.width,
				height: config.height,
				textureA,
				viewA: textureA.createView(),
				textureB,
				viewB: textureB.createView(),
				readFromA: true
			};
			pingPongTexturePairs.set(pass, pair);
			return pair;
		};

		const destroyPingPongShaderTexturePair = (pair: PingPongShaderTexturePair): void => {
			pair.textureA.destroy();
			pair.textureB.destroy();
		};

		const ensurePingPongShaderTexturePair = (
			pass: PingPongShaderPassLike,
			options: {
				target: string;
				width: number;
				height: number;
				format: GPUTextureFormat;
				filter: GPUFilterMode;
				addressModeU: GPUAddressMode;
				addressModeV: GPUAddressMode;
			}
		): PingPongShaderTexturePair => {
			const existing = pingPongShaderTexturePairs.get(pass);
			if (
				existing &&
				existing.target === options.target &&
				existing.width === options.width &&
				existing.height === options.height &&
				existing.format === options.format &&
				existing.filter === options.filter &&
				existing.addressModeU === options.addressModeU &&
				existing.addressModeV === options.addressModeV
			) {
				return existing;
			}

			if (existing) {
				destroyPingPongShaderTexturePair(existing);
			}

			assertTextureAllocationSize(
				device,
				options.width,
				options.height,
				`PingPongShaderPass target "${options.target}"`
			);

			const usage =
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.COPY_DST;
			const textureA = device.createTexture({
				size: { width: options.width, height: options.height, depthOrArrayLayers: 1 },
				format: options.format,
				usage
			});
			const textureB = device.createTexture({
				size: { width: options.width, height: options.height, depthOrArrayLayers: 1 },
				format: options.format,
				usage
			});
			const samplingLayout = resolveTextureSamplingLayout({
				format: options.format,
				filter: options.filter,
				deviceFeatures: device.features
			});
			const sampler = device.createSampler({
				magFilter: samplingLayout.effectiveFilter,
				minFilter: samplingLayout.effectiveFilter,
				addressModeU: options.addressModeU,
				addressModeV: options.addressModeV
			});

			const pair: PingPongShaderTexturePair = {
				target: options.target,
				format: options.format,
				width: options.width,
				height: options.height,
				filter: options.filter,
				addressModeU: options.addressModeU,
				addressModeV: options.addressModeV,
				sampleType: samplingLayout.sampleType,
				samplerType: samplingLayout.samplerType,
				effectiveFilter: samplingLayout.effectiveFilter,
				textureA,
				viewA: textureA.createView(),
				textureB,
				viewB: textureB.createView(),
				sampler,
				previousBindGroupLayout: null,
				readABindGroup: null,
				readBBindGroup: null,
				needsClear: true
			};
			pingPongShaderTexturePairs.set(pass, pair);
			return pair;
		};

		// ── Compute pipeline setup ──────────────────────────────────────────
		interface ComputePipelineEntry {
			pipeline: GPUComputePipeline;
			uniformBindGroup: GPUBindGroup;
			resourceBindGroupLayout: GPUBindGroupLayout | null;
			resourceBindGroupCaches: WeakMap<object, ComputeBindGroupCache>;
			pingPongResourceBindGroupCaches: WeakMap<
				object,
				{ readA: ComputeBindGroupCache; readB: ComputeBindGroupCache }
			>;
			workgroupSize: [number, number, number];
			computeSource: string;
			topologyKey: string;
		}
		// Per-source cache state. The renderer resolves the compute source for
		// each pass once per frame and looks it up here. The state machine
		// preserves the synchronous render contract while still surfacing the
		// rich asynchronously-discovered diagnostics from getCompilationInfo()
		// and the validation error scope.
		//
		// State transitions:
		//   (miss) → pending → ready    (compilation succeeded)
		//                    → error    (compilation failed)
		//
		// `pending` carries the optimistically-built entry so the first frame
		// after a source change can still dispatch (matching the prior
		// synchronous behaviour). If validation later reports an error the
		// cache is upgraded and the next render() call surfaces a fully
		// attributed Error from the compute-pass loop instead of letting the
		// derivative "[Invalid CommandBuffer] is invalid due to a previous
		// error" cascade reach the user.
		type ComputePipelineCacheState =
			| { kind: 'pending'; entry: ComputePipelineEntry; validation: Promise<void> }
			| { kind: 'ready'; entry: ComputePipelineEntry }
			| { kind: 'error'; error: Error };
		const MAX_COMPUTE_PIPELINE_CACHE_ENTRIES = 32;
		const computePipelineCache = new Map<string, ComputePipelineCacheState>();
		let nextComputePipelineLabelIndex = 0;
		const computeResourceLimits = getComputeResourceResolverLimits(device);
		const computeUniformTopologyKey = options.uniformLayout.entries
			.map((entry) => `${entry.name}:${entry.type}`)
			.join(',');
		const computeDeviceCapabilityKey = [
			...Array.from(device.features as Iterable<string>).sort(),
			...Object.entries(computeResourceLimits).map(([name, value]) => `${name}:${value}`)
		].join(',');

		const requestRender = options.requestRender;

		const setComputePipelineCacheState = (
			cacheKey: string,
			state: ComputePipelineCacheState
		): void => {
			if (computePipelineCache.has(cacheKey)) {
				computePipelineCache.delete(cacheKey);
			}
			computePipelineCache.set(cacheKey, state);
			while (computePipelineCache.size > MAX_COMPUTE_PIPELINE_CACHE_ENTRIES) {
				const oldestKey = computePipelineCache.keys().next().value;
				if (oldestKey === undefined) {
					break;
				}
				computePipelineCache.delete(oldestKey);
			}
		};

		const touchComputePipelineCacheState = (
			cacheKey: string,
			state: ComputePipelineCacheState
		): void => {
			computePipelineCache.delete(cacheKey);
			computePipelineCache.set(cacheKey, state);
		};

		const computeBuildResult = (
			cacheKey: string,
			buildOptions: {
				computeSource: string;
				workgroupSize: [number, number, number];
				resources: ResolvedComputePassResources;
			}
		): ComputePipelineCacheState => {
			const builtComputeShader = buildComputeShaderSourceWithMap({
				compute: buildOptions.computeSource,
				uniformLayout: options.uniformLayout,
				resources: buildOptions.resources.entries
			});

			const labelIndex = (nextComputePipelineLabelIndex += 1);
			const labelBase = `compute[${buildOptions.resources.topologyKey || 'uniforms-only'}]#${labelIndex}`;
			const moduleLabel = `${labelBase}:module`;
			const pipelineLabel = `${labelBase}:pipeline`;

			const workgroupSize = [...buildOptions.workgroupSize] as [number, number, number];

			// group(0) is fixed uniforms; optional group(1) is the resolved heterogeneous topology.
			const computeUniformBGL = device.createBindGroupLayout({
				label: `${labelBase}:bgl-uniforms`,
				entries: [
					{
						binding: FRAME_BINDING,
						visibility: GPUShaderStage.COMPUTE,
						buffer: { type: 'uniform', minBindingSize: 16 }
					},
					{
						binding: UNIFORM_BINDING,
						visibility: GPUShaderStage.COMPUTE,
						buffer: { type: 'uniform' }
					}
				]
			});

			const resourceBindGroupLayout =
				buildOptions.resources.entries.length > 0
					? device.createBindGroupLayout({
							label: `${labelBase}:bgl-resources`,
							entries: buildOptions.resources.entries.map((entry) => entry.layoutEntry)
						})
					: null;
			const bindGroupLayouts: GPUBindGroupLayout[] = [computeUniformBGL];
			if (resourceBindGroupLayout) bindGroupLayouts.push(resourceBindGroupLayout);

			const computePipelineLayout = device.createPipelineLayout({
				label: `${labelBase}:layout`,
				bindGroupLayouts
			});

			// Wrap the validation-prone calls in an error scope so the parser
			// error and "invalid module/pipeline" cascade are captured here
			// instead of leaking to `uncapturederror`. The popped scope is
			// awaited together with `getCompilationInfo()` below.
			device.pushErrorScope('validation');
			let computeShaderModule: GPUShaderModule;
			let pipeline: GPUComputePipeline;
			try {
				computeShaderModule = device.createShaderModule({
					label: moduleLabel,
					code: builtComputeShader.code
				});
				pipeline = device.createComputePipeline({
					label: pipelineLabel,
					layout: computePipelineLayout,
					compute: {
						module: computeShaderModule,
						entryPoint: 'compute'
					}
				});
			} catch (jsError) {
				// Always pop the scope even when the synchronous call threw,
				// otherwise the scope would leak. Real WebGPU implementations
				// rarely throw synchronously for shader compilation issues —
				// this branch primarily serves test mocks that simulate a
				// thrown `createComputePipeline`.
				void device.popErrorScope().catch(() => {
					// Discard popped error in the synchronous-throw branch —
					// we already have the JS exception with full context.
				});
				const error = toComputeCompilationError({
					error: jsError,
					lineMap: builtComputeShader.lineMap,
					computeSource: buildOptions.computeSource,
					runtimeContext
				});
				return { kind: 'error', error };
			}

			const validationScope = device.popErrorScope();

			// Build uniform bind group for compute (group 0)
			const computeUniformBindGroup = device.createBindGroup({
				label: `${labelBase}:bg-uniforms`,
				layout: computeUniformBGL,
				entries: [
					{ binding: FRAME_BINDING, resource: { buffer: frameBuffer } },
					{ binding: UNIFORM_BINDING, resource: { buffer: uniformBuffer } }
				]
			});

			const entry: ComputePipelineEntry = {
				pipeline,
				uniformBindGroup: computeUniformBindGroup,
				resourceBindGroupLayout,
				resourceBindGroupCaches: new WeakMap(),
				pingPongResourceBindGroupCaches: new WeakMap(),
				workgroupSize,
				computeSource: buildOptions.computeSource,
				topologyKey: buildOptions.resources.topologyKey
			};

			const validation = (async () => {
				const compilationError = await assertComputeCompilationAsync({
					module: computeShaderModule,
					validationScope,
					lineMap: builtComputeShader.lineMap,
					computeSource: buildOptions.computeSource,
					runtimeContext
				});
				if (isDestroyed) {
					return;
				}
				// Only upgrade state if no later cache-miss has already replaced
				// us (defensive — the cache is keyed by source so this should
				// be a no-op in practice, but it guards against in-flight
				// stragglers when the user edits the same source rapidly).
				const current = computePipelineCache.get(cacheKey);
				if (!current || current.kind !== 'pending') {
					return;
				}
				if (compilationError) {
					setComputePipelineCacheState(cacheKey, {
						kind: 'error',
						error: compilationError
					});
					// Drain any derivative-cascade noise queued by the
					// optimistic dispatch so the next render() call doesn't
					// throw "[Invalid CommandBuffer] is invalid due to a
					// previous error" before our rich diagnostic surfaces.
					uncapturedErrorMessages.length = 0;
					requestRender?.();
				} else {
					setComputePipelineCacheState(cacheKey, { kind: 'ready', entry });
				}
			})();

			return { kind: 'pending', entry, validation };
		};

		const buildComputePipelineEntry = (buildOptions: {
			computeSource: string;
			workgroupSize: [number, number, number];
			resources: ResolvedComputePassResources;
		}): ComputePipelineEntry => {
			const cacheKey = `compute:${computeUniformTopologyKey}:${buildOptions.resources.topologyKey}:${computeDeviceCapabilityKey}:${buildOptions.workgroupSize.join(',')}:${buildOptions.computeSource}`;
			const cached = computePipelineCache.get(cacheKey);
			if (cached) {
				touchComputePipelineCacheState(cacheKey, cached);
				if (cached.kind === 'error') {
					// Drain any derivative cascade messages that may have
					// arrived between frames so consumeUncapturedErrorMessage
					// in the next render() call doesn't surface them.
					uncapturedErrorMessages.length = 0;
					throw cached.error;
				}
				return cached.entry;
			}

			const state = computeBuildResult(cacheKey, buildOptions);
			setComputePipelineCacheState(cacheKey, state);
			if (state.kind === 'error') {
				uncapturedErrorMessages.length = 0;
				throw state.error;
			}
			return state.entry;
		};

		interface PingPongShaderPipelineEntry {
			pipeline: GPURenderPipeline;
			bindGroupLayout: GPUBindGroupLayout;
			previousBindGroupLayout: GPUBindGroupLayout;
			textureKeys: string[];
		}
		const pingPongShaderPipelineCache = new Map<string, PingPongShaderPipelineEntry>();

		const getFragmentTextureBindingsForKeys = (keys: string[]): RuntimeTextureBinding[] =>
			keys.map((key, index) => {
				const binding = textureBindingByKey.get(key);
				if (!binding || !binding.fragmentVisible) {
					throw new Error(`Missing fragment texture binding for "${key}".`);
				}
				return {
					...binding,
					...getTextureBindings(index)
				};
			});

		const buildPingPongShaderPipelineEntry = (
			pass: PingPongShaderPassLike,
			format: GPUTextureFormat,
			target: string
		): PingPongShaderPipelineEntry => {
			assertFloatSampledFormat({
				format,
				target,
				pass: 'PingPongShaderPass',
				deviceFeatures: device.features
			});
			assertFloatRenderableFormat({
				format,
				target,
				pass: 'PingPongShaderPass',
				deviceFeatures: device.features
			});
			const fragment = pass.getFragment();
			if (!fragment) {
				throw new Error('PingPongShaderPass must provide a fragment shader.');
			}

			const feedbackTextureKeys = fragmentTextureKeys.filter((key) => key !== target);
			const previousSamplingLayout = resolveTextureSamplingLayout({
				format,
				filter: pass.getFilter(),
				deviceFeatures: device.features
			});
			const cacheKey = [
				format,
				target,
				previousSamplingLayout.sampleType,
				previousSamplingLayout.samplerType,
				previousSamplingLayout.effectiveFilter,
				feedbackTextureKeys.join(','),
				options.uniformLayout.entries.map((entry) => `${entry.name}:${entry.type}`).join(','),
				fragment
			].join('|');
			const cached = pingPongShaderPipelineCache.get(cacheKey);
			if (cached) {
				return cached;
			}

			const fragmentLineMap = pass.getFragmentLineMap();
			const builtShader = buildPingPongShaderSourceWithMap(
				fragment,
				options.uniformLayout,
				feedbackTextureKeys,
				{ fragmentLineMap }
			);
			const shaderModule = device.createShaderModule({ code: builtShader.code });
			const feedbackBindGroupLayout = device.createBindGroupLayout({
				entries: createBindGroupLayoutEntries(
					getFragmentTextureBindingsForKeys(feedbackTextureKeys)
				)
			});
			const previousBindGroupLayout = device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: { type: previousSamplingLayout.samplerType }
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						texture: {
							sampleType: previousSamplingLayout.sampleType,
							viewDimension: '2d',
							multisampled: false
						}
					}
				]
			});
			const pipelineLayout = device.createPipelineLayout({
				bindGroupLayouts: [feedbackBindGroupLayout, previousBindGroupLayout]
			});
			const pipeline = device.createRenderPipeline({
				layout: pipelineLayout,
				vertex: {
					module: shaderModule,
					entryPoint: 'motiongpuPingPongVertex'
				},
				fragment: {
					module: shaderModule,
					entryPoint: 'motiongpuPingPongFragment',
					targets: [{ format }]
				},
				primitive: {
					topology: 'triangle-list'
				}
			});
			const entry = {
				pipeline,
				bindGroupLayout: feedbackBindGroupLayout,
				previousBindGroupLayout,
				textureKeys: feedbackTextureKeys
			};
			pingPongShaderPipelineCache.set(cacheKey, entry);
			return entry;
		};

		const getComputeBindingResource = (entry: ResolvedComputeResource): GPUBindingResource => {
			if (entry.source === 'external') return entry.bindingResource;
			const logicalId = String(entry.logicalId);
			switch (entry.kind) {
				case 'sampled-texture': {
					const resource = resourceRegistry.requireTexture(logicalId);
					if (
						entry.subresource.baseMipLevel === 0 &&
						entry.subresource.mipLevelCount === resource.mipLevelCount
					) {
						return resource.publishedView;
					}
					return entry.bindingResource;
				}
				case 'storage-texture': {
					const view = resourceRegistry.requireTexture(logicalId).storageView;
					if (!view) throw new Error(`Storage texture "${logicalId}" is not allocated.`);
					return view;
				}
				case 'storage-buffer': {
					const buffer = resourceRegistry.requireStorageBuffer(logicalId).buffer;
					return { buffer, size: entry.size };
				}
				case 'sampler': {
					const binding = textureBindingByKey.get(logicalId);
					if (!binding) throw new Error(`Material sampler "${logicalId}" is not available.`);
					return binding.sampler;
				}
			}
		};

		const getBindingReference = (resource: GPUBindingResource): unknown =>
			'buffer' in resource ? resource.buffer : resource;

		const createResolvedBindGroupEntries = (
			resources: ResolvedComputePassResources,
			pingPong?: { pair: PingPongTexturePair; readFromA: boolean }
		): { entries: GPUBindGroupEntry[]; refs: unknown[] } => {
			const entries: GPUBindGroupEntry[] = [];
			const refs: unknown[] = [];
			for (const entry of resources.entries) {
				let resource = getComputeBindingResource(entry);
				if (pingPong && entry.kind === 'sampled-texture' && entry.pingPong === 'read') {
					resource = pingPong.readFromA ? pingPong.pair.viewA : pingPong.pair.viewB;
				} else if (pingPong && entry.kind === 'storage-texture' && entry.pingPong === 'write') {
					resource = pingPong.readFromA ? pingPong.pair.viewB : pingPong.pair.viewA;
				}
				entries.push({ binding: entry.binding, resource });
				refs.push(getBindingReference(resource));
			}
			return { entries, refs };
		};

		const getComputeResourceBindGroup = (
			pipelineEntry: ComputePipelineEntry,
			pass: ComputePassLike,
			resources: ResolvedComputePassResources
		): GPUBindGroup | null => {
			if (!pipelineEntry.resourceBindGroupLayout) return null;
			let cache = pipelineEntry.resourceBindGroupCaches.get(pass as object);
			if (!cache) {
				cache = createComputeBindGroupCache(device);
				pipelineEntry.resourceBindGroupCaches.set(pass as object, cache);
			}
			const runtimeEntries = createResolvedBindGroupEntries(resources);
			return cache.getOrCreate({
				topologyKey: resources.topologyKey,
				layout: pipelineEntry.resourceBindGroupLayout,
				entries: runtimeEntries.entries,
				resourceRefs: runtimeEntries.refs
			});
		};

		const getPingPongResourceBindGroup = (
			pipelineEntry: ComputePipelineEntry,
			pass: ComputePassLike,
			resources: ResolvedComputePassResources,
			pair: PingPongTexturePair,
			readFromA: boolean
		): GPUBindGroup => {
			if (!pipelineEntry.resourceBindGroupLayout) {
				throw new Error('Ping-pong compute pipeline is missing its resource bind group layout.');
			}
			let caches = pipelineEntry.pingPongResourceBindGroupCaches.get(pass as object);
			if (!caches) {
				caches = {
					readA: createComputeBindGroupCache(device),
					readB: createComputeBindGroupCache(device)
				};
				pipelineEntry.pingPongResourceBindGroupCaches.set(pass as object, caches);
			}
			const runtimeEntries = createResolvedBindGroupEntries(resources, { pair, readFromA });
			const bindGroup = (readFromA ? caches.readA : caches.readB).getOrCreate({
				topologyKey: resources.topologyKey,
				layout: pipelineEntry.resourceBindGroupLayout,
				entries: runtimeEntries.entries,
				resourceRefs: runtimeEntries.refs
			});
			if (!bindGroup) throw new Error('Ping-pong compute resource bind group is empty.');
			return bindGroup;
		};

		let externalTextureViewCache = new WeakMap<GPUTexture, Map<string, GPUTextureView>>();
		const createCachedExternalTextureView = (
			texture: GPUTexture,
			descriptor: GPUTextureViewDescriptor
		): GPUTextureView => {
			const key = [
				descriptor.dimension ?? '2d',
				descriptor.baseMipLevel ?? 0,
				descriptor.mipLevelCount ?? 1,
				descriptor.baseArrayLayer ?? 0,
				descriptor.arrayLayerCount ?? 1
			].join(':');
			let views = externalTextureViewCache.get(texture);
			if (!views) {
				views = new Map();
				externalTextureViewCache.set(texture, views);
			}
			let view = views.get(key);
			if (!view) {
				view = texture.createView(descriptor);
				views.set(key, view);
			}
			return view;
		};

		const getPingPongShaderPreviousBindGroup = (
			pair: PingPongShaderTexturePair,
			layout: GPUBindGroupLayout,
			readFromA: boolean
		): GPUBindGroup => {
			if (pair.previousBindGroupLayout !== layout) {
				pair.previousBindGroupLayout = layout;
				pair.readABindGroup = null;
				pair.readBBindGroup = null;
			}

			if (readFromA) {
				if (!pair.readABindGroup) {
					pair.readABindGroup = device.createBindGroup({
						layout,
						entries: [
							{ binding: 0, resource: pair.sampler },
							{ binding: 1, resource: pair.viewA }
						]
					});
				}
				return pair.readABindGroup;
			}

			if (!pair.readBBindGroup) {
				pair.readBBindGroup = device.createBindGroup({
					layout,
					entries: [
						{ binding: 0, resource: pair.sampler },
						{ binding: 1, resource: pair.viewB }
					]
				});
			}
			return pair.readBBindGroup;
		};

		const frameBuffer = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		registerInitializationCleanup(() => {
			frameBuffer.destroy();
		});

		const uniformBuffer = device.createBuffer({
			size: options.uniformLayout.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		registerInitializationCleanup(() => {
			uniformBuffer.destroy();
		});
		const frameScratch = new Float32Array(4);
		const uniformScratch = new Float32Array(options.uniformLayout.byteLength / 4);
		const uniformPrevious = new Float32Array(options.uniformLayout.byteLength / 4);
		let hasUniformSnapshot = false;
		const mipmapGenerator = createGpuMipmapGenerator(device);

		const writeFrameBuffer = (time: number, delta: number, width: number, height: number): void => {
			frameScratch[0] = time;
			frameScratch[1] = delta;
			frameScratch[2] = width;
			frameScratch[3] = height;
			device.queue.writeBuffer(
				frameBuffer,
				0,
				frameScratch.buffer as ArrayBuffer,
				frameScratch.byteOffset,
				frameScratch.byteLength
			);
		};

		/**
		 * Rebuilds a fragment bind group using current texture views.
		 */
		const createTextureBindGroup = (
			layout: GPUBindGroupLayout,
			bindings: RuntimeTextureBinding[]
		): GPUBindGroup => {
			const entries: GPUBindGroupEntry[] = [
				{ binding: FRAME_BINDING, resource: { buffer: frameBuffer } },
				{ binding: UNIFORM_BINDING, resource: { buffer: uniformBuffer } }
			];

			for (const binding of bindings) {
				entries.push({
					binding: binding.samplerBinding,
					resource: binding.sampler
				});
				entries.push({
					binding: binding.textureBinding,
					resource: binding.resource.publishedView
				});
			}

			return device.createBindGroup({
				layout,
				entries
			});
		};

		const createBindGroup = (): GPUBindGroup =>
			createTextureBindGroup(bindGroupLayout, fragmentTextureBindings);

		const createPingPongShaderBindGroup = (entry: PingPongShaderPipelineEntry): GPUBindGroup =>
			createTextureBindGroup(
				entry.bindGroupLayout,
				getFragmentTextureBindingsForKeys(entry.textureKeys)
			);

		const attachFeedbackTextureBinding = (
			binding: RuntimeTextureBinding,
			view: GPUTextureView
		): boolean => {
			const resource = binding.resource;
			const changed = resource.publishedView !== view || !binding.feedbackViewActive;
			resource.ownedTexture?.destroy();
			resourceRegistry.replaceTextureAllocation(binding.key, {
				ownedTexture: null,
				storageView: null,
				sampledView: binding.fallbackView,
				format: resource.format,
				width: undefined,
				height: undefined,
				mipLevelCount: 1,
				usage: sampledFallbackUsage
			});
			resourceRegistry.publishTextureView(binding.key, view);
			binding.feedbackViewActive = true;
			binding.source = null;
			binding.lastToken = null;
			binding.mipmapsDirty = false;
			return changed;
		};

		/**
		 * Synchronizes one runtime texture binding with incoming texture value.
		 *
		 * @returns `true` when bind group must be rebuilt.
		 */
		const updateTextureBinding = (
			binding: RuntimeTextureBinding,
			value: TextureValue,
			renderMode: RenderMode
		): boolean => {
			const nextData = toTextureData(value);
			const resource = binding.resource;

			if (!nextData) {
				if (
					binding.source === null &&
					resource.ownedTexture === null &&
					!binding.feedbackViewActive
				) {
					return false;
				}

				resource.ownedTexture?.destroy();
				const changed = resourceRegistry.replaceTextureAllocation(binding.key, {
					ownedTexture: null,
					storageView: null,
					sampledView: binding.fallbackView,
					format: resource.format,
					width: undefined,
					height: undefined,
					mipLevelCount: 1,
					usage: sampledFallbackUsage
				});
				binding.feedbackViewActive = false;
				binding.source = null;
				binding.lastToken = null;
				binding.mipmapsDirty = false;
				return changed;
			}

			const source = nextData.source;
			const colorSpace = nextData.colorSpace ?? binding.defaultColorSpace;
			const format = resource.format;
			const flipY = nextData.flipY ?? binding.defaultFlipY;
			const premultipliedAlpha = nextData.premultipliedAlpha ?? binding.defaultPremultipliedAlpha;
			const generateMipmaps = nextData.generateMipmaps ?? binding.defaultGenerateMipmaps;
			const update = resolveTextureUpdateMode({
				source,
				...(nextData.update !== undefined ? { override: nextData.update } : {}),
				...(binding.defaultUpdate !== undefined ? { defaultMode: binding.defaultUpdate } : {})
			});
			const { width, height } = resolveTextureSize(nextData);
			assertTextureAllocationSize(device, width, height, `Texture "${binding.key}"`);
			const mipLevelCount = generateMipmaps ? getTextureMipLevelCount(width, height) : 1;
			const sourceChanged = binding.source !== source;
			const tokenChanged = binding.lastToken !== value;
			const requiresReallocation =
				resource.ownedTexture === null ||
				binding.feedbackViewActive ||
				resource.width !== width ||
				resource.height !== height ||
				resource.mipLevelCount !== mipLevelCount ||
				resource.format !== format;

			if (!requiresReallocation) {
				const shouldUpload =
					sourceChanged ||
					update === 'perFrame' ||
					(update === 'onInvalidate' && (renderMode !== 'always' || tokenChanged));

				if (shouldUpload && resource.ownedTexture) {
					uploadTextureBaseLevel(
						device,
						resource.ownedTexture,
						{ flipY, premultipliedAlpha },
						source,
						width,
						height
					);
					binding.flipY = flipY;
					binding.generateMipmaps = generateMipmaps;
					binding.premultipliedAlpha = premultipliedAlpha;
					binding.colorSpace = colorSpace;
					markTextureMipmapsDirty(binding, mipLevelCount);
				}

				binding.source = source;
				binding.update = update;
				binding.lastToken = value;
				binding.feedbackViewActive = false;
				return false;
			}

			let textureUsage =
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT;
			if (storageTextureKeySet.has(binding.key)) {
				textureUsage |= GPUTextureUsage.STORAGE_BINDING;
			}
			const texture = device.createTexture({
				size: { width, height, depthOrArrayLayers: 1 },
				format,
				mipLevelCount,
				usage: textureUsage
			});
			let view: GPUTextureView;
			try {
				uploadTextureBaseLevel(
					device,
					texture,
					{ flipY, premultipliedAlpha },
					source,
					width,
					height
				);
				view = texture.createView();
			} catch (error) {
				texture.destroy();
				throw error;
			}
			registerInitializationCleanup(() => {
				texture.destroy();
			});

			resource.ownedTexture?.destroy();
			const publishedViewChanged = resourceRegistry.replaceTextureAllocation(binding.key, {
				ownedTexture: texture,
				storageView: storageTextureKeySet.has(binding.key) ? view : null,
				sampledView: view,
				format,
				width,
				height,
				mipLevelCount,
				usage: textureUsage
			});
			binding.feedbackViewActive = false;
			binding.source = source;
			binding.update = update;
			binding.flipY = flipY;
			binding.generateMipmaps = generateMipmaps;
			binding.premultipliedAlpha = premultipliedAlpha;
			binding.colorSpace = colorSpace;
			binding.lastToken = value;
			markTextureMipmapsDirty(binding, mipLevelCount);
			return publishedViewChanged;
		};

		const generateDirtyTextureMipmaps = (commandEncoder: GPUCommandEncoder): void => {
			for (const binding of textureBindings) {
				const resource = binding.resource;
				if (
					!binding.mipmapsDirty ||
					!resource.ownedTexture ||
					!binding.generateMipmaps ||
					resource.mipLevelCount <= 1
				) {
					continue;
				}

				mipmapGenerator.generate({
					commandEncoder,
					texture: resource.ownedTexture,
					format: resource.format,
					mipLevelCount: resource.mipLevelCount
				});
				binding.mipmapsDirty = false;
			}
		};

		for (const binding of textureBindings) {
			// Skip storage textures — they are eagerly allocated and not source-driven
			if (normalizedTextureDefinitions[binding.key]?.storage) continue;
			const defaultSource = normalizedTextureDefinitions[binding.key]?.source ?? null;
			updateTextureBinding(binding, defaultSource, 'always');
		}

		let bindGroup = createBindGroup();
		let sourceSlotTarget: RuntimeRenderTarget | null = null;
		let targetSlotTarget: RuntimeRenderTarget | null = null;
		let presentationSlotTarget: RuntimeRenderTarget | null = null;
		let renderTargetSignature = '';
		let renderTargetSnapshot: Readonly<Record<string, RenderTarget>> = {};
		let renderTargetFormatSnapshot: RenderTargetFormatMap = {};
		let renderTargetKeys: string[] = [];
		let cachedGraphPlan: RenderGraphPlan | null = null;
		let cachedGraphRenderTargetSignature = '';
		const cachedGraphClearColor: [number, number, number, number] = [NaN, NaN, NaN, NaN];
		const cachedGraphPasses: RenderGraphPassSnapshot[] = [];
		let contextConfigured = false;
		let configuredWidth = 0;
		let configuredHeight = 0;
		let configuredCanvasFormat: GPUTextureFormat | null = null;
		let configuredDynamicRange: EffectiveDynamicRange | null = null;
		const runtimeRenderTargets = new Map<string, RuntimeRenderTarget>();
		const activePasses: AnyPass[] = [];
		const lifecyclePreviousSet = new Set<AnyPass>();
		const lifecycleNextSet = new Set<AnyPass>();
		const lifecycleUniquePasses: AnyPass[] = [];
		let lifecyclePassesRef: AnyPass[] | null = null;
		let passWidth = 0;
		let passHeight = 0;

		/**
		 * Pre-allocated canvas surface object mutated in-place each frame.
		 *
		 * Avoids creating a new `RenderTarget` object on every `render()` call.
		 * The `texture` and `view` fields are replaced with the current
		 * swapchain texture before use.
		 */
		const canvasSurface: RenderTarget = {
			texture: null as unknown as GPUTexture,
			view: null as unknown as GPUTextureView,
			width: 0,
			height: 0,
			format: effectiveCanvasFormat
		};

		/**
		 * Pre-allocated slots object mutated in-place each frame when passes are active.
		 *
		 * Avoids a new `{ source, target, canvas }` allocation on every `render()` call.
		 */
		const frameSlots = {
			source: null as unknown as RuntimeRenderTarget,
			target: null as unknown as RuntimeRenderTarget,
			canvas: canvasSurface
		};
		let frameSlotsActive = false;

		/**
		 * Resolves active render pass list for current frame.
		 */
		const resolvePasses = (): AnyPass[] => {
			return options.getPasses?.() ?? options.passes ?? [];
		};

		/**
		 * Resolves active render target declarations for current frame.
		 */
		const resolveRenderTargets = () => {
			return options.getRenderTargets?.() ?? options.renderTargets;
		};

		/**
		 * Checks whether cached render-graph plan can be reused for this frame.
		 */
		const isGraphPlanCacheValid = (
			passes: AnyPass[],
			clearColor: [number, number, number, number]
		): boolean => {
			if (!cachedGraphPlan) {
				return false;
			}

			if (cachedGraphRenderTargetSignature !== renderTargetSignature) {
				return false;
			}

			if (
				cachedGraphClearColor[0] !== clearColor[0] ||
				cachedGraphClearColor[1] !== clearColor[1] ||
				cachedGraphClearColor[2] !== clearColor[2] ||
				cachedGraphClearColor[3] !== clearColor[3]
			) {
				return false;
			}

			if (cachedGraphPasses.length !== passes.length) {
				return false;
			}

			for (let index = 0; index < passes.length; index += 1) {
				const pass = passes[index];
				const rp = pass as Partial<RenderPass>;
				const snapshot = cachedGraphPasses[index];
				if (!pass || !snapshot || snapshot.pass !== pass) {
					return false;
				}

				if (
					snapshot.enabled !== pass.enabled ||
					snapshot.needsSwap !== rp.needsSwap ||
					snapshot.input !== rp.input ||
					snapshot.output !== rp.output ||
					snapshot.clear !== rp.clear ||
					snapshot.preserve !== rp.preserve
				) {
					return false;
				}

				const passClearColor = rp.clearColor;
				const hasPassClearColor = passClearColor !== undefined;
				if (snapshot.hasClearColor !== hasPassClearColor) {
					return false;
				}

				if (passClearColor) {
					if (
						snapshot.clearColor0 !== passClearColor[0] ||
						snapshot.clearColor1 !== passClearColor[1] ||
						snapshot.clearColor2 !== passClearColor[2] ||
						snapshot.clearColor3 !== passClearColor[3]
					) {
						return false;
					}
				}
			}

			return true;
		};

		/**
		 * Updates render-graph cache with current pass set.
		 */
		const updateGraphPlanCache = (
			passes: AnyPass[],
			clearColor: [number, number, number, number],
			graphPlan: RenderGraphPlan
		): void => {
			cachedGraphPlan = graphPlan;
			cachedGraphRenderTargetSignature = renderTargetSignature;
			cachedGraphClearColor[0] = clearColor[0];
			cachedGraphClearColor[1] = clearColor[1];
			cachedGraphClearColor[2] = clearColor[2];
			cachedGraphClearColor[3] = clearColor[3];
			cachedGraphPasses.length = passes.length;

			let index = 0;
			for (const pass of passes) {
				const rp = pass as Partial<RenderPass>;
				const passClearColor = rp.clearColor;
				const hasPassClearColor = passClearColor !== undefined;
				const snapshot = cachedGraphPasses[index];
				if (!snapshot) {
					cachedGraphPasses[index] = {
						pass,
						enabled: pass.enabled,
						needsSwap: rp.needsSwap,
						input: rp.input,
						output: rp.output,
						clear: rp.clear,
						preserve: rp.preserve,
						hasClearColor: hasPassClearColor,
						clearColor0: passClearColor?.[0] ?? 0,
						clearColor1: passClearColor?.[1] ?? 0,
						clearColor2: passClearColor?.[2] ?? 0,
						clearColor3: passClearColor?.[3] ?? 0
					};
					index += 1;
					continue;
				}

				snapshot.pass = pass;
				snapshot.enabled = pass.enabled;
				snapshot.needsSwap = rp.needsSwap;
				snapshot.input = rp.input;
				snapshot.output = rp.output;
				snapshot.clear = rp.clear;
				snapshot.preserve = rp.preserve;
				snapshot.hasClearColor = hasPassClearColor;
				snapshot.clearColor0 = passClearColor?.[0] ?? 0;
				snapshot.clearColor1 = passClearColor?.[1] ?? 0;
				snapshot.clearColor2 = passClearColor?.[2] ?? 0;
				snapshot.clearColor3 = passClearColor?.[3] ?? 0;
				index += 1;
			}
		};

		/**
		 * Synchronizes pass lifecycle callbacks and resize notifications.
		 */
		const syncPassLifecycle = (passes: AnyPass[], width: number, height: number): void => {
			const resized = passWidth !== width || passHeight !== height;
			if (!resized && lifecyclePassesRef === passes && passes.length === activePasses.length) {
				let isSameOrder = true;
				for (let index = 0; index < passes.length; index += 1) {
					if (activePasses[index] !== passes[index]) {
						isSameOrder = false;
						break;
					}
				}

				if (isSameOrder) {
					return;
				}
			}

			lifecycleNextSet.clear();
			lifecycleUniquePasses.length = 0;
			for (const pass of passes) {
				if (lifecycleNextSet.has(pass)) {
					continue;
				}

				lifecycleNextSet.add(pass);
				lifecycleUniquePasses.push(pass);
			}
			lifecyclePreviousSet.clear();
			for (const pass of activePasses) {
				lifecyclePreviousSet.add(pass);
			}

			for (const pass of activePasses) {
				if (!lifecycleNextSet.has(pass)) {
					pass.dispose?.();
				}
			}

			for (const pass of lifecycleUniquePasses) {
				if (resized || !lifecyclePreviousSet.has(pass)) {
					pass.setSize?.(width, height);
				}
			}

			activePasses.length = 0;
			for (const pass of lifecycleUniquePasses) {
				activePasses.push(pass);
			}
			lifecyclePassesRef = passes;
			passWidth = width;
			passHeight = height;
		};

		const syncPingPongShaderTextureLifecycle = (passes: AnyPass[]): void => {
			const activeFeedbackPasses = new Set<PingPongShaderPassLike>();
			for (const pass of passes) {
				if (isManagedFeedbackPass(pass)) {
					activeFeedbackPasses.add(pass);
				}
			}

			for (const [pass, pair] of pingPongShaderTexturePairs.entries()) {
				if (activeFeedbackPasses.has(pass)) {
					continue;
				}
				destroyPingPongShaderTexturePair(pair);
				pingPongShaderTexturePairs.delete(pass);
			}
		};

		const syncPingPongComputeTextureLifecycle = (passes: AnyPass[]): void => {
			const activeComputePasses = new Set(passes.filter(isManagedComputePass));
			for (const [pass, pair] of pingPongTexturePairs.entries()) {
				if (activeComputePasses.has(pass)) continue;
				pair.textureA.destroy();
				pair.textureB.destroy();
				pingPongTexturePairs.delete(pass);
			}
		};

		/**
		 * Ensures internal ping-pong slot texture matches current canvas size/format.
		 */
		const ensureSlotTarget = (
			slot: RenderPassInputSlot,
			width: number,
			height: number
		): RuntimeRenderTarget => {
			const current = slot === 'source' ? sourceSlotTarget : targetSlotTarget;
			if (
				current &&
				current.width === width &&
				current.height === height &&
				current.format === workingFormat
			) {
				return current;
			}

			destroyRenderTexture(current);
			const next = createRenderTexture(device, width, height, workingFormat);
			if (slot === 'source') {
				sourceSlotTarget = next;
			} else {
				targetSlotTarget = next;
			}

			return next;
		};

		const ensurePresentationTarget = (width: number, height: number): RuntimeRenderTarget => {
			if (
				presentationSlotTarget &&
				presentationSlotTarget.width === width &&
				presentationSlotTarget.height === height &&
				presentationSlotTarget.format === workingFormat
			) {
				return presentationSlotTarget;
			}

			destroyRenderTexture(presentationSlotTarget);
			presentationSlotTarget = createRenderTexture(device, width, height, workingFormat);
			return presentationSlotTarget;
		};

		/**
		 * Creates/updates runtime render targets and returns immutable pass snapshot.
		 */
		const syncRenderTargets = (
			canvasWidth: number,
			canvasHeight: number
		): Readonly<Record<string, RenderTarget>> => {
			const definitions = resolveRenderTargets();
			const validatedFormats = validateRenderTargetFormats(
				definitions,
				workingFormat,
				device.features
			);
			const resolvedDefinitions = resolveRenderTargetDefinitions(
				definitions,
				canvasWidth,
				canvasHeight,
				workingFormat
			);
			const nextSignature = buildRenderTargetSignature(resolvedDefinitions);

			if (nextSignature !== renderTargetSignature) {
				const activeKeys = new Set<string>();
				for (const definition of resolvedDefinitions) {
					activeKeys.add(definition.key);
				}

				for (const [key, target] of runtimeRenderTargets.entries()) {
					if (!activeKeys.has(key)) {
						target.texture.destroy();
						runtimeRenderTargets.delete(key);
					}
				}

				for (const definition of resolvedDefinitions) {
					const current = runtimeRenderTargets.get(definition.key);
					if (
						current &&
						current.width === definition.width &&
						current.height === definition.height &&
						current.format === definition.format
					) {
						continue;
					}

					current?.texture.destroy();
					runtimeRenderTargets.set(
						definition.key,
						createRenderTexture(device, definition.width, definition.height, definition.format)
					);
				}

				renderTargetSignature = nextSignature;
				const nextSnapshot: Record<string, RenderTarget> = {};
				const nextKeys: string[] = [];
				for (const definition of resolvedDefinitions) {
					const target = runtimeRenderTargets.get(definition.key);
					if (!target) {
						continue;
					}

					nextKeys.push(definition.key);
					nextSnapshot[definition.key] = {
						texture: target.texture,
						view: target.view,
						width: target.width,
						height: target.height,
						format: target.format
					};
				}

				renderTargetSnapshot = nextSnapshot;
				renderTargetFormatSnapshot = validatedFormats;
				renderTargetKeys = nextKeys;
			}

			return renderTargetSnapshot;
		};

		/**
		 * Presents a texture view to the current canvas texture.
		 */
		const presentToCanvas = (
			commandEncoder: GPUCommandEncoder,
			sourceView: GPUTextureView,
			canvasView: GPUTextureView,
			clearColor: [number, number, number, number],
			applyFinalTransform: boolean
		): void => {
			let bindGroup = presentationBindGroupByView.get(sourceView);
			if (!bindGroup) {
				bindGroup = device.createBindGroup({
					layout: presentationBindGroupLayout,
					entries: [
						{ binding: 0, resource: presentationSampler },
						{ binding: 1, resource: sourceView }
					]
				});
				presentationBindGroupByView.set(sourceView, bindGroup);
			}

			const pass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: canvasView,
						clearValue: toPremultipliedCanvasClearValue(clearColor),
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});

			const pipeline = presentationPipelines.get(
				buildPresentationPipelineKey(
					effectiveCanvasFormat,
					effectiveDynamicRange,
					applyFinalTransform,
					true
				)
			);
			if (!pipeline) {
				throw new Error(
					`Missing presentation pipeline for ${effectiveCanvasFormat}/${effectiveDynamicRange}.`
				);
			}
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, bindGroup);
			pass.draw(3);
			pass.end();
		};

		const flushStorageWrites = (writes: Parameters<Renderer['flushStorageWrites']>[0]): void => {
			for (const write of writes) {
				const resource = resourceRegistry.getStorageBuffer(write.name);
				if (!resource) {
					continue;
				}
				const data = write.data;
				device.queue.writeBuffer(
					resource.buffer,
					write.offset,
					data.buffer as ArrayBuffer,
					data.byteOffset,
					data.byteLength
				);
			}
		};

		/**
		 * Executes a full frame render.
		 */
		const render: Renderer['render'] = ({
			time,
			delta,
			renderMode,
			uniforms,
			textures,
			canvasSize,
			pendingStorageWrites
		}) => {
			if (deviceLostMessage) {
				throw new Error(deviceLostMessage);
			}

			const uncapturedMessage = consumeUncapturedErrorMessage();
			if (uncapturedMessage) {
				const message = uncapturedMessage;
				throw new Error(message);
			}

			const { width, height } = resizeCanvas(options.canvas, options.getDpr(), canvasSize);

			if (
				!contextConfigured ||
				configuredWidth !== width ||
				configuredHeight !== height ||
				configuredCanvasFormat !== effectiveCanvasFormat ||
				configuredDynamicRange !== effectiveDynamicRange
			) {
				try {
					context.configure(
						buildCanvasConfiguration({
							device,
							format: effectiveCanvasFormat,
							dynamicRange: effectiveDynamicRange,
							canvasColorSpace: colorPipeline.canvasColorSpace
						})
					);
				} catch (error) {
					if (colorPipeline.dynamicRange !== 'auto' || effectiveDynamicRange !== 'hdr') {
						if (colorPipeline.dynamicRange === 'hdr' && effectiveDynamicRange === 'hdr') {
							const detail = error instanceof Error ? error.message : String(error);
							throw new Error(`HDR canvas presentation is not supported: ${detail}`, {
								cause: error
							});
						}
						throw error;
					}

					effectiveCanvasFormat = colorPipeline.fallbackCanvasFormat;
					effectiveDynamicRange = 'sdr';
					context.configure(
						buildCanvasConfiguration({
							device,
							format: effectiveCanvasFormat,
							dynamicRange: effectiveDynamicRange,
							canvasColorSpace: colorPipeline.canvasColorSpace
						})
					);
				}
				contextConfigured = true;
				configuredWidth = width;
				configuredHeight = height;
				configuredCanvasFormat = effectiveCanvasFormat;
				configuredDynamicRange = effectiveDynamicRange;
			}

			writeFrameBuffer(time, delta, width, height);

			packUniformsIntoFast(uniforms, options.uniformLayout, uniformScratch);
			if (!hasUniformSnapshot) {
				device.queue.writeBuffer(
					uniformBuffer,
					0,
					uniformScratch.buffer as ArrayBuffer,
					uniformScratch.byteOffset,
					uniformScratch.byteLength
				);
				uniformPrevious.set(uniformScratch);
				hasUniformSnapshot = true;
			} else {
				const dirtyRanges = findDirtyFloatRanges(uniformPrevious, uniformScratch);
				for (const range of dirtyRanges) {
					const byteOffset = range.start * 4;
					const byteLength = range.count * 4;
					device.queue.writeBuffer(
						uniformBuffer,
						byteOffset,
						uniformScratch.buffer as ArrayBuffer,
						uniformScratch.byteOffset + byteOffset,
						byteLength
					);
				}

				if (dirtyRanges.length > 0) {
					uniformPrevious.set(uniformScratch);
				}
			}

			const passes = resolvePasses();
			const activePingPongShaderTargets = new Set<string>();
			for (const pass of passes) {
				if (pass.enabled === false) {
					continue;
				}
				if (isManagedFeedbackPass(pass)) {
					const target = pass.getTarget();
					if (target) {
						activePingPongShaderTargets.add(target);
					}
				}
			}

			const commandEncoder = device.createCommandEncoder();
			let bindGroupDirty = false;
			for (const binding of textureBindings) {
				// Storage textures are managed by compute passes, skip source-driven updates
				if (normalizedTextureDefinitions[binding.key]?.storage) continue;
				if (activePingPongShaderTargets.has(binding.key)) continue;
				const nextTexture =
					textures[binding.key] ?? normalizedTextureDefinitions[binding.key]?.source ?? null;
				if (updateTextureBinding(binding, nextTexture, renderMode) && binding.fragmentVisible) {
					bindGroupDirty = true;
				}
			}

			if (bindGroupDirty) {
				bindGroup = createBindGroup();
				bindGroupDirty = false;
			}

			// Apply pending storage buffer writes
			if (pendingStorageWrites) {
				flushStorageWrites(pendingStorageWrites);
			}

			generateDirtyTextureMipmaps(commandEncoder);
			const clearColor = options.getClearColor();
			syncPassLifecycle(passes, width, height);
			syncPingPongComputeTextureLifecycle(passes);
			syncPingPongShaderTextureLifecycle(passes);
			const runtimeTargets = syncRenderTargets(width, height);
			const resolvedComputeResourcesByPass = new Map<AnyPass, ResolvedComputePassResources>();
			const computeLabelsByPass = new Map<AnyPass, string>();
			const computeExternalState = createComputeExternalResolutionState();
			let computeDeclarationIndex = 0;
			for (const pass of passes) {
				if (pass.enabled === false) continue;
				if (!isManagedComputePass(pass)) continue;
				const passLabel = `Compute pass #${computeDeclarationIndex}`;
				computeDeclarationIndex += 1;
				const resources = resolveComputePassResources(pass.getResources(), {
					passLabel,
					deviceFeatures: device.features as ReadonlySet<string>,
					limits: computeResourceLimits,
					externalContext: { device, width, height, time, delta },
					getMaterialTexture: (logicalId) => resourceRegistry.getTexture(logicalId),
					getMaterialStorageBuffer: (logicalId) => resourceRegistry.getStorageBuffer(logicalId),
					getMaterialSampler: (logicalId) => {
						const binding = textureBindingByKey.get(logicalId);
						return binding
							? {
									logicalId,
									sampler: binding.sampler,
									type: binding.samplerType,
									sampleType: binding.resource.sampleType
								}
							: undefined;
					},
					createTextureView: createCachedExternalTextureView,
					pingPong: pass.isPingPong === true,
					externalState: computeExternalState,
					diagnosticContext: runtimeContext
				});
				resolvedComputeResourcesByPass.set(pass, resources);
				computeLabelsByPass.set(pass, passLabel);
			}
			const graphPlan = isGraphPlanCacheValid(passes, clearColor)
				? (() => {
						const cached = cachedGraphPlan!;
						for (const step of cached.computeSteps) {
							const resources = resolvedComputeResourcesByPass.get(step.pass);
							if (!resources) {
								throw new Error('Cached compute graph step is missing resolved resources.');
							}
							step.resolvedResources = resources;
						}
						return cached;
					})()
				: (() => {
						let nextPlan: RenderGraphPlan;
						try {
							nextPlan = planRenderGraph(passes, clearColor, renderTargetKeys, {
								getResolvedResources: (pass) => resolvedComputeResourcesByPass.get(pass),
								getPassLabel: (pass) => computeLabelsByPass.get(pass) ?? 'Compute pass'
							});
						} catch (error) {
							throw attachMotionGPUErrorContext(error, runtimeContext);
						}
						updateGraphPlanCache(passes, clearColor, nextPlan);
						return nextPlan;
					})();
			validateBuiltInRenderPassFormats({
				passes,
				workingFormat,
				namedFormats: renderTargetFormatSnapshot,
				deviceFeatures: device.features
			});
			if (graphPlan.renderSteps.length > 0) {
				validatePresentationSourceFormat({
					slot: graphPlan.finalOutput,
					workingFormat,
					namedFormats: renderTargetFormatSnapshot,
					deviceFeatures: device.features,
					requiresFilterableInput: presentationSamplingLayout.samplerType === 'filtering'
				});
			}
			const canvasTexture = context.getCurrentTexture();
			// Mutate the pre-allocated surface object rather than allocating a new one.
			canvasSurface.texture = canvasTexture;
			canvasSurface.view = canvasTexture.createView();
			canvasSurface.width = width;
			canvasSurface.height = height;
			canvasSurface.format = effectiveCanvasFormat;

			const presentationRequired = colorPipeline.requiresPresentationPass;
			const graphHasRenderSteps = graphPlan.renderSteps.length > 0;
			const presentationSurface =
				presentationRequired || graphHasRenderSteps
					? ensurePresentationTarget(width, height)
					: null;
			if (graphHasRenderSteps) {
				frameSlots.source = ensureSlotTarget('source', width, height);
				frameSlots.target = ensureSlotTarget('target', width, height);
				frameSlots.canvas = presentationSurface!;
				frameSlotsActive = true;
			} else {
				frameSlotsActive = false;
			}
			const slots = frameSlotsActive ? frameSlots : null;
			const sceneOutput = slots ? slots.source : (presentationSurface ?? canvasSurface);

			let activeFrameBufferWidth = width;
			let activeFrameBufferHeight = height;
			const ensureFrameBufferResolution = (nextWidth: number, nextHeight: number): void => {
				if (activeFrameBufferWidth === nextWidth && activeFrameBufferHeight === nextHeight) {
					return;
				}
				writeFrameBuffer(time, delta, nextWidth, nextHeight);
				activeFrameBufferWidth = nextWidth;
				activeFrameBufferHeight = nextHeight;
			};
			const clearFeedbackView = (
				view: GPUTextureView,
				clearColor: [number, number, number, number]
			): void => {
				const pass = commandEncoder.beginRenderPass({
					colorAttachments: [
						{
							view,
							clearValue: toClearValue(clearColor),
							loadOp: 'clear',
							storeOp: 'store'
						}
					]
				});
				pass.end();
			};

			// Execute pre-scene passes so storage textures, buffers and fragment
			// feedback outputs are up-to-date when the scene shader samples them.
			let computeStepIndex = 0;
			let feedbackStepIndex = 0;
			for (const step of graphPlan.preSceneSteps) {
				if (step.kind === 'compute') {
					ensureFrameBufferResolution(width, height);
					const computeStepLabel = step.computeLabel ?? `Compute pass #${computeStepIndex}`;
					computeStepIndex += 1;
					if (!isManagedComputePass(step.pass)) {
						throw new Error(`${computeStepLabel} has an invalid managed pass contract.`);
					}
					const computePass = step.pass;
					const computeSource = computePass.getCompute();
					const resources = step.resolvedResources;
					if (!resources) throw new Error(`${computeStepLabel} is missing resolved resources.`);
					const pingPongRead = resources.entries.find(
						(entry) => entry.kind === 'sampled-texture' && entry.pingPong === 'read'
					);
					const pingPongWrite = resources.entries.find(
						(entry) => entry.kind === 'storage-texture' && entry.pingPong === 'write'
					);
					let pingPongPair: PingPongTexturePair | null = null;
					if (computePass.isPingPong) {
						if (
							!pingPongRead ||
							!pingPongWrite ||
							pingPongRead.source !== 'material' ||
							pingPongWrite.source !== 'material' ||
							typeof pingPongRead.logicalId !== 'string' ||
							!Object.is(pingPongRead.logicalId, pingPongWrite.logicalId)
						) {
							throw createMotionGPUError(
								'PINGPONG_CONFIGURATION_INVALID',
								`${computeStepLabel} ping-pong pair must reference one renderer-managed material texture.`
							);
						}
						pingPongPair = ensurePingPongTexturePair(computePass, pingPongRead.logicalId);
					}
					const workgroupSize = computePass.getWorkgroupSize();
					const pipelineEntry = buildComputePipelineEntry({
						computeSource,
						workgroupSize,
						resources
					});
					const resourceBindGroup = pingPongPair
						? null
						: getComputeResourceBindGroup(pipelineEntry, computePass, resources);
					const iterations = computePass.isPingPong ? (computePass.getIterations?.() ?? 1) : 1;
					if (!Number.isInteger(iterations) || iterations < 1) {
						throw new Error(
							`${computeStepLabel} iterations must be a positive integer >= 1, got ${iterations}.`
						);
					}

					for (let iter = 0; iter < iterations; iter += 1) {
						const dispatchLabel =
							iterations > 1 ? `${computeStepLabel} iteration ${iter + 1}` : computeStepLabel;
						const dispatch = validateComputeDispatch(
							computePass.resolveDispatch({
								width,
								height,
								time,
								delta,
								workgroupSize
							}),
							maxComputeWorkgroupsPerDimension,
							dispatchLabel
						);
						const cPass = commandEncoder.beginComputePass();
						cPass.setPipeline(pipelineEntry.pipeline);
						cPass.setBindGroup(0, pipelineEntry.uniformBindGroup);
						if (pingPongPair) {
							cPass.setBindGroup(
								1,
								getPingPongResourceBindGroup(
									pipelineEntry,
									computePass,
									resources,
									pingPongPair,
									pingPongPair.readFromA
								)
							);
						} else if (resourceBindGroup) {
							cPass.setBindGroup(1, resourceBindGroup);
						}
						cPass.dispatchWorkgroups(dispatch[0], dispatch[1], dispatch[2]);
						cPass.end();
						if (pingPongPair) pingPongPair.readFromA = !pingPongPair.readFromA;
					}

					if (pingPongPair) {
						const latestView = pingPongPair.readFromA ? pingPongPair.viewA : pingPongPair.viewB;
						if (resourceRegistry.markTextureWritten(pingPongPair.logicalId, latestView)) {
							const binding = textureBindingByKey.get(pingPongPair.logicalId);
							if (binding?.fragmentVisible) bindGroupDirty = true;
						}
					} else {
						const written = new Set<string>();
						for (const entry of resources.entries) {
							if (entry.source !== 'material' || written.has(String(entry.logicalId))) continue;
							if (entry.kind === 'storage-texture') {
								written.add(String(entry.logicalId));
								resourceRegistry.markTextureWritten(String(entry.logicalId));
							} else if (entry.kind === 'storage-buffer' && entry.access === 'storage-read-write') {
								written.add(String(entry.logicalId));
								resourceRegistry.markStorageBufferWritten(String(entry.logicalId));
							}
						}
					}
					continue;
				}

				if (step.kind !== 'feedback') {
					continue;
				}

				const feedbackStepLabel = `PingPongShaderPass #${feedbackStepIndex}`;
				feedbackStepIndex += 1;
				if (!isManagedFeedbackPass(step.pass)) {
					throw new Error(`${feedbackStepLabel} has an invalid managed pass contract.`);
				}
				const feedbackPass = step.pass;
				const target = feedbackPass.getTarget();
				if (!target) {
					throw new Error('PingPongShaderPass must provide a target texture key.');
				}

				const targetBinding = textureBindingByKey.get(target);
				if (!targetBinding) {
					throw new Error(
						`PingPongShaderPass target "${target}" must reference a declared material texture.`
					);
				}
				if (!targetBinding.fragmentVisible) {
					throw new Error(
						`PingPongShaderPass target "${target}" must be visible to the fragment shader.`
					);
				}
				if (normalizedTextureDefinitions[target]?.storage) {
					throw new Error(
						`PingPongShaderPass target "${target}" must be declared as a sampled texture, not storage:true. Use PingPongComputePass for storage textures.`
					);
				}

				const size = feedbackPass.resolveSize({ width, height });
				const pair = ensurePingPongShaderTexturePair(feedbackPass, {
					target,
					width: size.width,
					height: size.height,
					format: feedbackPass.getFormat(),
					filter: feedbackPass.getFilter(),
					addressModeU: feedbackPass.getAddressModeU(),
					addressModeV: feedbackPass.getAddressModeV()
				});
				const pipelineEntry = buildPingPongShaderPipelineEntry(feedbackPass, pair.format, target);
				const feedbackBindGroup = createPingPongShaderBindGroup(pipelineEntry);
				const resetColor = feedbackPass.consumeResetColor();
				const initializationColor =
					resetColor ?? (pair.needsClear ? feedbackPass.getClearColor() : null);
				if (initializationColor) {
					clearFeedbackView(pair.viewA, initializationColor);
					clearFeedbackView(pair.viewB, initializationColor);
					pair.needsClear = false;
				}

				const iterations = feedbackPass.getIterations();
				if (!Number.isInteger(iterations) || iterations < 1) {
					throw new Error(
						`${feedbackStepLabel} iterations must be a positive integer >= 1, got ${iterations}.`
					);
				}

				ensureFrameBufferResolution(pair.width, pair.height);
				const currentOutput = feedbackPass.getCurrentOutput();
				const readFromAAtIterationZero = currentOutput !== `${pair.target}B`;

				for (let iter = 0; iter < iterations; iter += 1) {
					const readFromA = iter % 2 === 0 ? readFromAAtIterationZero : !readFromAAtIterationZero;
					const outputView = readFromA ? pair.viewB : pair.viewA;
					const previousBindGroup = getPingPongShaderPreviousBindGroup(
						pair,
						pipelineEntry.previousBindGroupLayout,
						readFromA
					);
					const pass = commandEncoder.beginRenderPass({
						colorAttachments: [
							{
								view: outputView,
								clearValue: { r: 0, g: 0, b: 0, a: 0 },
								loadOp: 'load',
								storeOp: 'store'
							}
						]
					});
					pass.setPipeline(pipelineEntry.pipeline);
					pass.setBindGroup(0, feedbackBindGroup);
					pass.setBindGroup(1, previousBindGroup);
					pass.draw(3);
					pass.end();
				}

				feedbackPass.advanceFrame();
				const latestOutput = feedbackPass.getCurrentOutput();
				const latestView = latestOutput === `${pair.target}B` ? pair.viewB : pair.viewA;
				if (attachFeedbackTextureBinding(targetBinding, latestView)) {
					bindGroup = createBindGroup();
				}
			}
			if (bindGroupDirty) {
				bindGroup = createBindGroup();
			}
			ensureFrameBufferResolution(width, height);

			const scenePass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: sceneOutput.view,
						clearValue:
							sceneOutput === canvasSurface
								? toPremultipliedCanvasClearValue(clearColor)
								: toClearValue(clearColor),
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});

			scenePass.setPipeline(
				!slots && !presentationRequired && directCanvasPipeline ? directCanvasPipeline : pipeline
			);
			scenePass.setBindGroup(0, bindGroup);
			if (fragmentStorageBindGroup) {
				scenePass.setBindGroup(1, fragmentStorageBindGroup);
			}
			scenePass.draw(3);
			scenePass.end();

			let finalPresentationSurface: RenderTarget = sceneOutput;
			if (slots) {
				const resolveStepSurface = (
					slot: RenderPassInputSlot | RenderPassOutputSlot
				): RenderTarget => {
					if (slot === 'source') {
						return slots.source;
					}

					if (slot === 'target') {
						return slots.target;
					}

					if (slot === 'canvas') {
						return slots.canvas;
					}

					const named = runtimeTargets[slot];
					if (!named) {
						throw new Error(`Render graph references unknown runtime target "${slot}".`);
					}

					return named;
				};

				for (const step of graphPlan.renderSteps) {
					const input = resolveStepSurface(step.input);
					const output = resolveStepSurface(step.output);

					(step.pass as RenderPass).render({
						device,
						commandEncoder,
						source: slots.source,
						target: slots.target,
						canvas: slots.canvas,
						input,
						output,
						targets: runtimeTargets,
						time,
						delta,
						width,
						height,
						clear: step.clear,
						clearColor: step.clearColor,
						preserve: step.preserve,
						beginRenderPass: (passOptions?: {
							clear?: boolean;
							clearColor?: [number, number, number, number];
							preserve?: boolean;
							view?: GPUTextureView;
						}) => {
							const clear = passOptions?.clear ?? step.clear;
							const clearColor = passOptions?.clearColor ?? step.clearColor;
							const preserve = passOptions?.preserve ?? step.preserve;

							return commandEncoder.beginRenderPass({
								colorAttachments: [
									{
										view: passOptions?.view ?? output.view,
										clearValue: toClearValue(clearColor),
										loadOp: clear ? 'clear' : 'load',
										storeOp: preserve ? 'store' : 'discard'
									}
								]
							});
						}
					});

					if (step.needsSwap) {
						const previousSource = slots.source;
						slots.source = slots.target;
						slots.target = previousSource;
					}
				}

				finalPresentationSurface = resolveStepSurface(graphPlan.finalOutput);
				if (!presentationRequired) {
					presentToCanvas(
						commandEncoder,
						finalPresentationSurface.view,
						canvasSurface.view,
						clearColor,
						false
					);
				}
			}

			if (presentationRequired) {
				presentToCanvas(
					commandEncoder,
					finalPresentationSurface.view,
					canvasSurface.view,
					clearColor,
					true
				);
			}

			device.queue.submit([commandEncoder.finish()]);
		};

		acceptInitializationCleanups = false;
		initializationCleanups.length = 0;
		return {
			render,
			flushStorageWrites,
			getStorageBuffer: (name: string): GPUBuffer | undefined => {
				return resourceRegistry.getStorageBuffer(name)?.buffer;
			},
			getDevice: (): GPUDevice => {
				return device;
			},
			destroy: () => {
				if (isDestroyed) {
					return;
				}
				isDestroyed = true;
				device.removeEventListener('uncapturederror', handleUncapturedError);
				frameBuffer.destroy();
				uniformBuffer.destroy();
				for (const key of storageBufferKeys) {
					resourceRegistry.getStorageBuffer(key)?.buffer.destroy();
				}
				for (const pair of pingPongTexturePairs.values()) {
					pair.textureA.destroy();
					pair.textureB.destroy();
				}
				pingPongTexturePairs.clear();
				for (const pair of pingPongShaderTexturePairs.values()) {
					destroyPingPongShaderTexturePair(pair);
				}
				pingPongShaderTexturePairs.clear();
				computePipelineCache.clear();
				externalTextureViewCache = new WeakMap();
				pingPongShaderPipelineCache.clear();
				destroyRenderTexture(sourceSlotTarget);
				destroyRenderTexture(targetSlotTarget);
				destroyRenderTexture(presentationSlotTarget);
				for (const target of runtimeRenderTargets.values()) {
					target.texture.destroy();
				}
				runtimeRenderTargets.clear();
				for (const pass of activePasses) {
					pass.dispose?.();
				}
				activePasses.length = 0;
				lifecyclePassesRef = null;
				for (const binding of textureBindings) {
					binding.resource.ownedTexture?.destroy();
				}
				sampledFallbackPool.destroy();
				resourceRegistry.clear();
				presentationBindGroupByView = new WeakMap();
				cachedGraphPlan = null;
				cachedGraphPasses.length = 0;
				renderTargetSnapshot = {};
				renderTargetKeys = [];
				destroyDevice();
			}
		};
	} catch (error) {
		isDestroyed = true;
		acceptInitializationCleanups = false;
		device.removeEventListener('uncapturederror', handleUncapturedError);
		runInitializationCleanups();
		destroyDevice();
		throw error;
	}
}
