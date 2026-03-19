import { buildRenderTargetSignature, resolveRenderTargetDefinitions } from './render-targets.js';
import { planRenderGraph, type RenderGraphPlan } from './render-graph.js';
import {
	buildShaderSourceWithMap,
	formatShaderSourceLocation,
	type ShaderLineMap
} from './shader.js';
import {
	attachShaderCompilationDiagnostics,
	type ShaderCompilationRuntimeContext
} from './error-diagnostics.js';
import {
	getTextureMipLevelCount,
	normalizeTextureDefinitions,
	resolveTextureUpdateMode,
	resolveTextureSize,
	toTextureData
} from './textures.js';
import { packUniformsInto } from './uniforms.js';
import type {
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
	samplerBinding: number;
	textureBinding: number;
	sampler: GPUSampler;
	fallbackTexture: GPUTexture;
	fallbackView: GPUTextureView;
	texture: GPUTexture | null;
	view: GPUTextureView;
	source: TextureSource | null;
	width: number | undefined;
	height: number | undefined;
	mipLevelCount: number;
	format: GPUTextureFormat;
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
 * Cached pass properties used to validate render-graph cache correctness.
 */
interface RenderGraphPassSnapshot {
	pass: RenderPass;
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
	const error = new Error(`WGSL compilation failed:\n${summary}`);
	throw attachShaderCompilationDiagnostics(error, {
		kind: 'shader-compilation',
		diagnostics,
		fragmentSource: options?.fragmentSource ?? '',
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

function buildPassGraphSnapshot(
	passes: RenderPass[] | undefined
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
		const needsSwap = pass.needsSwap ?? true;
		const input = pass.input ?? 'source';
		const output = pass.output ?? (needsSwap ? 'target' : 'source');
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
 * Creates a 1x1 white fallback texture used before user textures become available.
 */
function createFallbackTexture(device: GPUDevice, format: GPUTextureFormat): GPUTexture {
	const texture = device.createTexture({
		size: { width: 1, height: 1, depthOrArrayLayers: 1 },
		format,
		usage:
			GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
	});

	const pixel = new Uint8Array([255, 255, 255, 255]);
	device.queue.writeTexture(
		{ texture },
		pixel,
		{ offset: 0, bytesPerRow: 4, rowsPerImage: 1 },
		{ width: 1, height: 1, depthOrArrayLayers: 1 }
	);

	return texture;
}

/**
 * Creates an offscreen canvas used for CPU mipmap generation.
 */
function createMipmapCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
	if (typeof OffscreenCanvas !== 'undefined') {
		return new OffscreenCanvas(width, height);
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
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
 * Uploads source content to a GPU texture and optionally generates mip chain on CPU.
 */
function uploadTexture(
	device: GPUDevice,
	texture: GPUTexture,
	binding: Pick<RuntimeTextureBinding, 'flipY' | 'premultipliedAlpha' | 'generateMipmaps'>,
	source: TextureSource,
	width: number,
	height: number,
	mipLevelCount: number
): void {
	device.queue.copyExternalImageToTexture(
		createExternalCopySource(source, {
			flipY: binding.flipY,
			premultipliedAlpha: binding.premultipliedAlpha
		}),
		{ texture, mipLevel: 0 },
		{ width, height, depthOrArrayLayers: 1 }
	);

	if (!binding.generateMipmaps || mipLevelCount <= 1) {
		return;
	}

	let previousSource: CanvasImageSource = source;
	let previousWidth = width;
	let previousHeight = height;

	for (let level = 1; level < mipLevelCount; level += 1) {
		const nextWidth = Math.max(1, Math.floor(previousWidth / 2));
		const nextHeight = Math.max(1, Math.floor(previousHeight / 2));
		const canvas = createMipmapCanvas(nextWidth, nextHeight);
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Unable to create 2D context for mipmap generation');
		}

		context.drawImage(
			previousSource,
			0,
			0,
			previousWidth,
			previousHeight,
			0,
			0,
			nextWidth,
			nextHeight
		);

		device.queue.copyExternalImageToTexture(
			createExternalCopySource(canvas, {
				premultipliedAlpha: binding.premultipliedAlpha
			}),
			{ texture, mipLevel: level },
			{ width: nextWidth, height: nextHeight, depthOrArrayLayers: 1 }
		);

		previousSource = canvas;
		previousWidth = nextWidth;
		previousHeight = nextHeight;
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
			sampler: { type: 'filtering' }
		});

		entries.push({
			binding: binding.textureBinding,
			visibility: GPUShaderStage.FRAGMENT,
			texture: {
				sampleType: 'float',
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
 * Computes dirty float ranges between two uniform snapshots.
 *
 * Adjacent dirty ranges separated by a gap smaller than or equal to
 * {@link DIRTY_RANGE_MERGE_GAP} are merged to reduce `writeBuffer` calls.
 */
export function findDirtyFloatRanges(
	previous: Float32Array,
	next: Float32Array,
	mergeGapThreshold = DIRTY_RANGE_MERGE_GAP
): Array<{ start: number; count: number }> {
	const ranges: Array<{ start: number; count: number }> = [];
	let start = -1;

	for (let index = 0; index < next.length; index += 1) {
		if (previous[index] !== next[index]) {
			if (start === -1) {
				start = index;
			}
			continue;
		}

		if (start !== -1) {
			ranges.push({ start, count: index - start });
			start = -1;
		}
	}

	if (start !== -1) {
		ranges.push({ start, count: next.length - start });
	}

	if (ranges.length <= 1) {
		return ranges;
	}

	const merged: Array<{ start: number; count: number }> = [ranges[0]!];
	for (let index = 1; index < ranges.length; index += 1) {
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
 * Determines whether shader output should perform linear-to-sRGB conversion.
 */
function shouldConvertLinearToSrgb(
	outputColorSpace: 'srgb' | 'linear',
	canvasFormat: GPUTextureFormat
): boolean {
	if (outputColorSpace !== 'srgb') {
		return false;
	}

	return !canvasFormat.endsWith('-srgb');
}

/**
 * WGSL shader used to blit an offscreen texture to the canvas.
 */
function createFullscreenBlitShader(): string {
	return `
struct MotionGPUVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@group(0) @binding(0) var motiongpuBlitSampler: sampler;
@group(0) @binding(1) var motiongpuBlitTexture: texture_2d<f32>;

@vertex
fn motiongpuBlitVertex(@builtin(vertex_index) index: u32) -> MotionGPUVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: MotionGPUVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = (position + vec2f(1.0, 1.0)) * 0.5;
	return out;
}

@fragment
fn motiongpuBlitFragment(in: MotionGPUVertexOut) -> @location(0) vec4f {
	return textureSample(motiongpuBlitTexture, motiongpuBlitSampler, in.uv);
}
`;
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

	const format = navigator.gpu.getPreferredCanvasFormat();
	const adapter = await navigator.gpu.requestAdapter(options.adapterOptions);
	if (!adapter) {
		throw new Error('Unable to acquire WebGPU adapter');
	}

	const device = await adapter.requestDevice(options.deviceDescriptor);
	let isDestroyed = false;
	let deviceLostMessage: string | null = null;
	let uncapturedErrorMessage: string | null = null;
	const initializationCleanups: Array<() => void> = [];
	let acceptInitializationCleanups = true;

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
	});

	const handleUncapturedError = (event: GPUUncapturedErrorEvent): void => {
		if (isDestroyed) {
			return;
		}

		const message =
			event.error instanceof Error
				? event.error.message
				: String((event.error as { message?: string })?.message ?? event.error);
		uncapturedErrorMessage = `WebGPU uncaptured error: ${message}`;
	};

	device.addEventListener('uncapturederror', handleUncapturedError);
	try {
		const runtimeContext = buildShaderCompilationRuntimeContext(options);
		const convertLinearToSrgb = shouldConvertLinearToSrgb(options.outputColorSpace, format);
		const builtShader = buildShaderSourceWithMap(
			options.fragmentWgsl,
			options.uniformLayout,
			options.textureKeys,
			{
				convertLinearToSrgb,
				fragmentLineMap: options.fragmentLineMap
			}
		);
		const shaderModule = device.createShaderModule({ code: builtShader.code });
		await assertCompilation(shaderModule, {
			lineMap: builtShader.lineMap,
			fragmentSource: options.fragmentSource,
			includeSources: options.includeSources,
			...(options.defineBlockSource !== undefined
				? { defineBlockSource: options.defineBlockSource }
				: {}),
			materialSource: options.materialSource ?? null,
			runtimeContext
		});

		const normalizedTextureDefinitions = normalizeTextureDefinitions(
			options.textureDefinitions,
			options.textureKeys
		);
		const textureBindings = options.textureKeys.map((key, index): RuntimeTextureBinding => {
			const config = normalizedTextureDefinitions[key];
			if (!config) {
				throw new Error(`Missing texture definition for "${key}"`);
			}

			const { samplerBinding, textureBinding } = getTextureBindings(index);
			const sampler = device.createSampler({
				magFilter: config.filter,
				minFilter: config.filter,
				mipmapFilter: config.generateMipmaps ? config.filter : 'nearest',
				addressModeU: config.addressModeU,
				addressModeV: config.addressModeV,
				maxAnisotropy: config.filter === 'linear' ? config.anisotropy : 1
			});
			const fallbackTexture = createFallbackTexture(device, config.format);
			registerInitializationCleanup(() => {
				fallbackTexture.destroy();
			});
			const fallbackView = fallbackTexture.createView();

			const runtimeBinding: RuntimeTextureBinding = {
				key,
				samplerBinding,
				textureBinding,
				sampler,
				fallbackTexture,
				fallbackView,
				texture: null,
				view: fallbackView,
				source: null,
				width: undefined,
				height: undefined,
				mipLevelCount: 1,
				format: config.format,
				colorSpace: config.colorSpace,
				defaultColorSpace: config.colorSpace,
				flipY: config.flipY,
				defaultFlipY: config.flipY,
				generateMipmaps: config.generateMipmaps,
				defaultGenerateMipmaps: config.generateMipmaps,
				premultipliedAlpha: config.premultipliedAlpha,
				defaultPremultipliedAlpha: config.premultipliedAlpha,
				update: config.update ?? 'once',
				lastToken: null
			};

			if (config.update !== undefined) {
				runtimeBinding.defaultUpdate = config.update;
			}

			return runtimeBinding;
		});

		const bindGroupLayout = device.createBindGroupLayout({
			entries: createBindGroupLayoutEntries(textureBindings)
		});
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [bindGroupLayout]
		});

		const pipeline = device.createRenderPipeline({
			layout: pipelineLayout,
			vertex: {
				module: shaderModule,
				entryPoint: 'motiongpuVertex'
			},
			fragment: {
				module: shaderModule,
				entryPoint: 'motiongpuFragment',
				targets: [{ format }]
			},
			primitive: {
				topology: 'triangle-list'
			}
		});

		const blitShaderModule = device.createShaderModule({
			code: createFullscreenBlitShader()
		});
		await assertCompilation(blitShaderModule);

		const blitBindGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: 'filtering' }
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						sampleType: 'float',
						viewDimension: '2d',
						multisampled: false
					}
				}
			]
		});
		const blitPipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [blitBindGroupLayout]
		});
		const blitPipeline = device.createRenderPipeline({
			layout: blitPipelineLayout,
			vertex: { module: blitShaderModule, entryPoint: 'motiongpuBlitVertex' },
			fragment: {
				module: blitShaderModule,
				entryPoint: 'motiongpuBlitFragment',
				targets: [{ format }]
			},
			primitive: {
				topology: 'triangle-list'
			}
		});
		const blitSampler = device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});
		let blitBindGroupByView = new WeakMap<GPUTextureView, GPUBindGroup>();

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

		/**
		 * Rebuilds bind group using current texture views.
		 */
		const createBindGroup = (): GPUBindGroup => {
			const entries: GPUBindGroupEntry[] = [
				{ binding: FRAME_BINDING, resource: { buffer: frameBuffer } },
				{ binding: UNIFORM_BINDING, resource: { buffer: uniformBuffer } }
			];

			for (const binding of textureBindings) {
				entries.push({
					binding: binding.samplerBinding,
					resource: binding.sampler
				});
				entries.push({
					binding: binding.textureBinding,
					resource: binding.view
				});
			}

			return device.createBindGroup({
				layout: bindGroupLayout,
				entries
			});
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

			if (!nextData) {
				if (binding.source === null && binding.texture === null) {
					return false;
				}

				binding.texture?.destroy();
				binding.texture = null;
				binding.view = binding.fallbackView;
				binding.source = null;
				binding.width = undefined;
				binding.height = undefined;
				binding.lastToken = null;
				return true;
			}

			const source = nextData.source;
			const colorSpace = nextData.colorSpace ?? binding.defaultColorSpace;
			const format = colorSpace === 'linear' ? 'rgba8unorm' : 'rgba8unorm-srgb';
			const flipY = nextData.flipY ?? binding.defaultFlipY;
			const premultipliedAlpha = nextData.premultipliedAlpha ?? binding.defaultPremultipliedAlpha;
			const generateMipmaps = nextData.generateMipmaps ?? binding.defaultGenerateMipmaps;
			const update = resolveTextureUpdateMode({
				source,
				...(nextData.update !== undefined ? { override: nextData.update } : {}),
				...(binding.defaultUpdate !== undefined ? { defaultMode: binding.defaultUpdate } : {})
			});
			const { width, height } = resolveTextureSize(nextData);
			const mipLevelCount = generateMipmaps ? getTextureMipLevelCount(width, height) : 1;
			const sourceChanged = binding.source !== source;
			const tokenChanged = binding.lastToken !== value;
			const requiresReallocation =
				binding.texture === null ||
				binding.width !== width ||
				binding.height !== height ||
				binding.mipLevelCount !== mipLevelCount ||
				binding.format !== format;

			if (!requiresReallocation) {
				const shouldUpload =
					sourceChanged ||
					update === 'perFrame' ||
					(update === 'onInvalidate' && (renderMode !== 'always' || tokenChanged));

				if (shouldUpload && binding.texture) {
					binding.flipY = flipY;
					binding.generateMipmaps = generateMipmaps;
					binding.premultipliedAlpha = premultipliedAlpha;
					binding.colorSpace = colorSpace;
					uploadTexture(device, binding.texture, binding, source, width, height, mipLevelCount);
				}

				binding.source = source;
				binding.width = width;
				binding.height = height;
				binding.mipLevelCount = mipLevelCount;
				binding.update = update;
				binding.lastToken = value;
				return false;
			}

			const texture = device.createTexture({
				size: { width, height, depthOrArrayLayers: 1 },
				format,
				mipLevelCount,
				usage:
					GPUTextureUsage.TEXTURE_BINDING |
					GPUTextureUsage.COPY_DST |
					GPUTextureUsage.RENDER_ATTACHMENT
			});
			registerInitializationCleanup(() => {
				texture.destroy();
			});

			binding.flipY = flipY;
			binding.generateMipmaps = generateMipmaps;
			binding.premultipliedAlpha = premultipliedAlpha;
			binding.colorSpace = colorSpace;
			binding.format = format;
			uploadTexture(device, texture, binding, source, width, height, mipLevelCount);

			binding.texture?.destroy();
			binding.texture = texture;
			binding.view = texture.createView();
			binding.source = source;
			binding.width = width;
			binding.height = height;
			binding.mipLevelCount = mipLevelCount;
			binding.update = update;
			binding.lastToken = value;
			return true;
		};

		for (const binding of textureBindings) {
			const defaultSource = normalizedTextureDefinitions[binding.key]?.source ?? null;
			updateTextureBinding(binding, defaultSource, 'always');
		}

		let bindGroup = createBindGroup();
		let sourceSlotTarget: RuntimeRenderTarget | null = null;
		let targetSlotTarget: RuntimeRenderTarget | null = null;
		let renderTargetSignature = '';
		let renderTargetSnapshot: Readonly<Record<string, RenderTarget>> = {};
		let renderTargetKeys: string[] = [];
		let cachedGraphPlan: RenderGraphPlan | null = null;
		let cachedGraphRenderTargetSignature = '';
		const cachedGraphClearColor: [number, number, number, number] = [NaN, NaN, NaN, NaN];
		const cachedGraphPasses: RenderGraphPassSnapshot[] = [];
		let contextConfigured = false;
		let configuredWidth = 0;
		let configuredHeight = 0;
		const runtimeRenderTargets = new Map<string, RuntimeRenderTarget>();
		const activePasses: RenderPass[] = [];
		const lifecyclePreviousSet = new Set<RenderPass>();
		const lifecycleNextSet = new Set<RenderPass>();
		const lifecycleUniquePasses: RenderPass[] = [];
		let lifecyclePassesRef: RenderPass[] | null = null;
		let passWidth = 0;
		let passHeight = 0;

		/**
		 * Resolves active render pass list for current frame.
		 */
		const resolvePasses = (): RenderPass[] => {
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
			passes: RenderPass[],
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
				const snapshot = cachedGraphPasses[index];
				if (!pass || !snapshot || snapshot.pass !== pass) {
					return false;
				}

				if (
					snapshot.enabled !== pass.enabled ||
					snapshot.needsSwap !== pass.needsSwap ||
					snapshot.input !== pass.input ||
					snapshot.output !== pass.output ||
					snapshot.clear !== pass.clear ||
					snapshot.preserve !== pass.preserve
				) {
					return false;
				}

				const passClearColor = pass.clearColor;
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
			passes: RenderPass[],
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
				const passClearColor = pass.clearColor;
				const hasPassClearColor = passClearColor !== undefined;
				const snapshot = cachedGraphPasses[index];
				if (!snapshot) {
					cachedGraphPasses[index] = {
						pass,
						enabled: pass.enabled,
						needsSwap: pass.needsSwap,
						input: pass.input,
						output: pass.output,
						clear: pass.clear,
						preserve: pass.preserve,
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
				snapshot.needsSwap = pass.needsSwap;
				snapshot.input = pass.input;
				snapshot.output = pass.output;
				snapshot.clear = pass.clear;
				snapshot.preserve = pass.preserve;
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
		const syncPassLifecycle = (passes: RenderPass[], width: number, height: number): void => {
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
				current.format === format
			) {
				return current;
			}

			destroyRenderTexture(current);
			const next = createRenderTexture(device, width, height, format);
			if (slot === 'source') {
				sourceSlotTarget = next;
			} else {
				targetSlotTarget = next;
			}

			return next;
		};

		/**
		 * Creates/updates runtime render targets and returns immutable pass snapshot.
		 */
		const syncRenderTargets = (
			canvasWidth: number,
			canvasHeight: number
		): Readonly<Record<string, RenderTarget>> => {
			const resolvedDefinitions = resolveRenderTargetDefinitions(
				resolveRenderTargets(),
				canvasWidth,
				canvasHeight,
				format
			);
			const nextSignature = buildRenderTargetSignature(resolvedDefinitions);

			if (nextSignature !== renderTargetSignature) {
				const activeKeys = new Set(resolvedDefinitions.map((definition) => definition.key));

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
				renderTargetKeys = nextKeys;
			}

			return renderTargetSnapshot;
		};

		/**
		 * Blits a texture view to the current canvas texture.
		 */
		const blitToCanvas = (
			commandEncoder: GPUCommandEncoder,
			sourceView: GPUTextureView,
			canvasView: GPUTextureView,
			clearColor: [number, number, number, number]
		): void => {
			let bindGroup = blitBindGroupByView.get(sourceView);
			if (!bindGroup) {
				bindGroup = device.createBindGroup({
					layout: blitBindGroupLayout,
					entries: [
						{ binding: 0, resource: blitSampler },
						{ binding: 1, resource: sourceView }
					]
				});
				blitBindGroupByView.set(sourceView, bindGroup);
			}

			const pass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: canvasView,
						clearValue: {
							r: clearColor[0],
							g: clearColor[1],
							b: clearColor[2],
							a: clearColor[3]
						},
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});

			pass.setPipeline(blitPipeline);
			pass.setBindGroup(0, bindGroup);
			pass.draw(3);
			pass.end();
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
			canvasSize
		}) => {
			if (deviceLostMessage) {
				throw new Error(deviceLostMessage);
			}

			if (uncapturedErrorMessage) {
				const message = uncapturedErrorMessage;
				uncapturedErrorMessage = null;
				throw new Error(message);
			}

			const { width, height } = resizeCanvas(options.canvas, options.getDpr(), canvasSize);

			if (!contextConfigured || configuredWidth !== width || configuredHeight !== height) {
				context.configure({
					device,
					format,
					alphaMode: 'premultiplied'
				});
				contextConfigured = true;
				configuredWidth = width;
				configuredHeight = height;
			}

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

			packUniformsInto(uniforms, options.uniformLayout, uniformScratch);
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

			let bindGroupDirty = false;
			for (const binding of textureBindings) {
				const nextTexture =
					textures[binding.key] ?? normalizedTextureDefinitions[binding.key]?.source ?? null;
				if (updateTextureBinding(binding, nextTexture, renderMode)) {
					bindGroupDirty = true;
				}
			}

			if (bindGroupDirty) {
				bindGroup = createBindGroup();
			}

			const commandEncoder = device.createCommandEncoder();
			const passes = resolvePasses();
			const clearColor = options.getClearColor();
			syncPassLifecycle(passes, width, height);
			const runtimeTargets = syncRenderTargets(width, height);
			const graphPlan = isGraphPlanCacheValid(passes, clearColor)
				? cachedGraphPlan!
				: (() => {
						const nextPlan = planRenderGraph(passes, clearColor, renderTargetKeys);
						updateGraphPlanCache(passes, clearColor, nextPlan);
						return nextPlan;
					})();
			const canvasTexture = context.getCurrentTexture();
			const canvasSurface: RenderTarget = {
				texture: canvasTexture,
				view: canvasTexture.createView(),
				width,
				height,
				format
			};
			const slots =
				graphPlan.steps.length > 0
					? {
							source: ensureSlotTarget('source', width, height),
							target: ensureSlotTarget('target', width, height),
							canvas: canvasSurface
						}
					: null;
			const sceneOutput = slots ? slots.source : canvasSurface;

			const scenePass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: sceneOutput.view,
						clearValue: {
							r: clearColor[0],
							g: clearColor[1],
							b: clearColor[2],
							a: clearColor[3]
						},
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});

			scenePass.setPipeline(pipeline);
			scenePass.setBindGroup(0, bindGroup);
			scenePass.draw(3);
			scenePass.end();

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

				for (const step of graphPlan.steps) {
					const input = resolveStepSurface(step.input);
					const output = resolveStepSurface(step.output);

					step.pass.render({
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
						beginRenderPass: (passOptions) => {
							const clear = passOptions?.clear ?? step.clear;
							const clearColor = passOptions?.clearColor ?? step.clearColor;
							const preserve = passOptions?.preserve ?? step.preserve;

							return commandEncoder.beginRenderPass({
								colorAttachments: [
									{
										view: passOptions?.view ?? output.view,
										clearValue: {
											r: clearColor[0],
											g: clearColor[1],
											b: clearColor[2],
											a: clearColor[3]
										},
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

				if (graphPlan.finalOutput !== 'canvas') {
					const finalSurface = resolveStepSurface(graphPlan.finalOutput);
					blitToCanvas(commandEncoder, finalSurface.view, slots.canvas.view, clearColor);
				}
			}

			device.queue.submit([commandEncoder.finish()]);
		};

		acceptInitializationCleanups = false;
		initializationCleanups.length = 0;
		return {
			render,
			destroy: () => {
				isDestroyed = true;
				device.removeEventListener('uncapturederror', handleUncapturedError);
				frameBuffer.destroy();
				uniformBuffer.destroy();
				destroyRenderTexture(sourceSlotTarget);
				destroyRenderTexture(targetSlotTarget);
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
					binding.texture?.destroy();
					binding.fallbackTexture.destroy();
				}
				blitBindGroupByView = new WeakMap();
				cachedGraphPlan = null;
				cachedGraphPasses.length = 0;
				renderTargetSnapshot = {};
				renderTargetKeys = [];
			}
		};
	} catch (error) {
		isDestroyed = true;
		acceptInitializationCleanups = false;
		device.removeEventListener('uncapturederror', handleUncapturedError);
		runInitializationCleanups();
		throw error;
	}
}
