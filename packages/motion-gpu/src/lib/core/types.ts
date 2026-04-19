/**
 * Core runtime and API contracts used by MotionGPU's renderer, hooks and scheduler.
 */

/**
 * WGSL-compatible uniform primitive and aggregate types supported by MotionGPU.
 */
export type UniformType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f';

/**
 * Explicitly typed uniform declaration.
 *
 * @typeParam TType - WGSL type tag.
 * @typeParam TValue - Runtime value shape for the selected type.
 */
/**
 * Accepted matrix value formats for `mat4x4f` uniforms.
 */
export type UniformMat4Value = number[] | Float32Array;

/**
 * Runtime value shape by WGSL uniform type tag.
 */
export interface UniformValueByType {
	f32: number;
	vec2f: [number, number];
	vec3f: [number, number, number];
	vec4f: [number, number, number, number];
	mat4x4f: UniformMat4Value;
}

export interface TypedUniform<
	TType extends UniformType = UniformType,
	TValue extends UniformValueByType[TType] = UniformValueByType[TType]
> {
	/**
	 * WGSL type tag.
	 */
	type: TType;
	/**
	 * Runtime value matching {@link type}.
	 */
	value: TValue;
}

/**
 * Supported uniform input shapes accepted by material and render APIs.
 */
export type UniformValue =
	| number
	| [number, number]
	| [number, number, number]
	| [number, number, number, number]
	| TypedUniform<'f32'>
	| TypedUniform<'vec2f'>
	| TypedUniform<'vec3f'>
	| TypedUniform<'vec4f'>
	| TypedUniform<'mat4x4f'>;

/**
 * Uniform map keyed by WGSL identifier names.
 */
export type UniformMap<TKey extends string = string> = Record<TKey, UniformValue>;

/**
 * Resolved layout metadata for a single uniform field inside the packed uniform buffer.
 */
export interface UniformLayoutEntry {
	/**
	 * Uniform field name.
	 */
	name: string;
	/**
	 * WGSL field type.
	 */
	type: UniformType;
	/**
	 * Byte offset within packed uniform buffer.
	 */
	offset: number;
	/**
	 * Field byte size without trailing alignment padding.
	 */
	size: number;
}

/**
 * GPU uniform buffer layout resolved from a {@link UniformMap} using WGSL alignment rules.
 */
export interface UniformLayout {
	/**
	 * Layout entries sorted by uniform name.
	 */
	entries: UniformLayoutEntry[];
	/**
	 * Fast lookup table by uniform name.
	 */
	byName: Record<string, UniformLayoutEntry>;
	/**
	 * Final uniform buffer size in bytes.
	 */
	byteLength: number;
}

/**
 * Supported runtime texture source types accepted by WebGPU uploads.
 */
export type TextureSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

/**
 * Texture payload with optional explicit dimensions.
 */
export interface TextureData {
	/**
	 * GPU-uploadable image source.
	 */
	source: TextureSource;
	/**
	 * Optional explicit width override.
	 */
	width?: number;
	/**
	 * Optional explicit height override.
	 */
	height?: number;
	/**
	 * Optional runtime color space override.
	 */
	colorSpace?: 'srgb' | 'linear';
	/**
	 * Optional runtime flip-y override.
	 */
	flipY?: boolean;
	/**
	 * Optional runtime premultiplied-alpha override.
	 */
	premultipliedAlpha?: boolean;
	/**
	 * Optional runtime mipmap generation override.
	 */
	generateMipmaps?: boolean;
	/**
	 * Runtime update strategy override.
	 */
	update?: TextureUpdateMode;
}

/**
 * Texture input accepted by renderer state APIs.
 */
export type TextureValue = TextureData | TextureSource | null;

/**
 * Texture update strategy for dynamic sources.
 */
export type TextureUpdateMode = 'once' | 'onInvalidate' | 'perFrame';

/**
 * Per-texture sampling and upload configuration.
 */
export interface TextureDefinition {
	/**
	 * Default/initial texture value for this slot.
	 */
	source?: TextureValue;
	/**
	 * Source color space used for format/decode decisions.
	 */
	colorSpace?: 'srgb' | 'linear';
	/**
	 * Vertical flip during upload.
	 */
	flipY?: boolean;
	/**
	 * Enables mipmap generation.
	 */
	generateMipmaps?: boolean;
	/**
	 * Enables premultiplied-alpha upload mode.
	 */
	premultipliedAlpha?: boolean;
	/**
	 * Dynamic source update strategy.
	 */
	update?: TextureUpdateMode;
	/**
	 * Sampler anisotropy level (clamped internally).
	 */
	anisotropy?: number;
	/**
	 * Min/mag filter mode.
	 */
	filter?: GPUFilterMode;
	/**
	 * U axis address mode.
	 */
	addressModeU?: GPUAddressMode;
	/**
	 * V axis address mode.
	 */
	addressModeV?: GPUAddressMode;
	/**
	 * When true, this texture is also writable by compute passes.
	 */
	storage?: boolean;
	/**
	 * Required when storage is true. Must be a storage-compatible format.
	 */
	format?: GPUTextureFormat;
	/**
	 * Explicit texture width. Required for storage textures without a source.
	 */
	width?: number;
	/**
	 * Explicit texture height. Required for storage textures without a source.
	 */
	height?: number;
	/**
	 * When true, texture is visible (sampled) in fragment shader. Default: true.
	 */
	fragmentVisible?: boolean;
}

/**
 * Texture definition map keyed by uniform-compatible texture names.
 */
export type TextureDefinitionMap<TKey extends string = string> = Record<TKey, TextureDefinition>;

/**
 * Runtime texture value map keyed by texture uniform names.
 */
export type TextureMap<TKey extends string = string> = Record<TKey, TextureValue>;

// ── Storage buffer types ────────────────────────────────────────────────────

/**
 * Access mode for storage buffers in compute shaders.
 */
export type StorageBufferAccess = 'read' | 'read-write';

/**
 * WGSL storage buffer element type.
 */
export type StorageBufferType =
	| 'array<f32>'
	| 'array<vec2f>'
	| 'array<vec3f>'
	| 'array<vec4f>'
	| 'array<u32>'
	| 'array<i32>'
	| 'array<vec4u>'
	| 'array<vec4i>';

/**
 * Definition of a single storage buffer resource.
 */
export interface StorageBufferDefinition {
	/**
	 * Buffer size in bytes. Must be > 0 and multiple of 4.
	 */
	size: number;
	/**
	 * WGSL type annotation for codegen.
	 */
	type: StorageBufferType;
	/**
	 * Access mode in compute shader. Default: 'read-write'.
	 */
	access?: StorageBufferAccess;
	/**
	 * Initial data uploaded on creation.
	 */
	initialData?: Float32Array | Uint32Array | Int32Array;
}

/**
 * Map of named storage buffer definitions.
 */
export type StorageBufferDefinitionMap<TKey extends string = string> = Record<
	TKey,
	StorageBufferDefinition
>;

/**
 * Output color space requested for final canvas presentation.
 */
export type OutputColorSpace = 'srgb' | 'linear';

/**
 * Declarative render target definition for post-processing or multi-pass pipelines.
 */
export interface RenderTargetDefinition {
	/**
	 * Explicit target width. If omitted, derived from `scale * canvasWidth`.
	 */
	width?: number;
	/**
	 * Explicit target height. If omitted, derived from `scale * canvasHeight`.
	 */
	height?: number;
	/**
	 * Canvas-relative scale for implicit dimensions.
	 */
	scale?: number;
	/**
	 * Texture format override.
	 */
	format?: GPUTextureFormat;
}

/**
 * Runtime render target handle exposed to render passes.
 */
export interface RenderTarget {
	/**
	 * Backing GPU texture.
	 */
	texture: GPUTexture;
	/**
	 * Default texture view.
	 */
	view: GPUTextureView;
	/**
	 * Width in pixels.
	 */
	width: number;
	/**
	 * Height in pixels.
	 */
	height: number;
	/**
	 * GPU texture format.
	 */
	format: GPUTextureFormat;
}

/**
 * Named render target definitions keyed by output slot names.
 */
export type RenderTargetDefinitionMap<TKey extends string = string> = Record<
	TKey,
	RenderTargetDefinition
>;

/**
 * User-defined render slot name (mapped to `renderTargets` keys).
 */
export type RenderPassNamedSlot = string & {};

/**
 * Built-in render graph source slots.
 */
export type RenderPassInputSlot = 'source' | 'target' | RenderPassNamedSlot;

/**
 * Built-in render graph output slots.
 */
export type RenderPassOutputSlot = 'source' | 'target' | 'canvas' | RenderPassNamedSlot;

/**
 * Per-pass render flags controlling attachment behavior.
 */
export interface RenderPassFlags {
	/**
	 * Clears output attachment before drawing.
	 */
	clear?: boolean;
	/**
	 * Clear color used when {@link clear} is enabled.
	 */
	clearColor?: [number, number, number, number];
	/**
	 * Stores output attachment contents after rendering.
	 */
	preserve?: boolean;
}

/**
 * Execution context passed to formal render passes.
 */
export interface RenderPassContext extends Required<RenderPassFlags> {
	/**
	 * Active GPU device.
	 */
	device: GPUDevice;
	/**
	 * Shared command encoder for this frame.
	 */
	commandEncoder: GPUCommandEncoder;
	/**
	 * Current source slot surface.
	 */
	source: RenderTarget;
	/**
	 * Current ping-pong target slot surface.
	 */
	target: RenderTarget;
	/**
	 * Current frame canvas surface.
	 */
	canvas: RenderTarget;
	/**
	 * Resolved pass input surface.
	 */
	input: RenderTarget;
	/**
	 * Resolved pass output surface.
	 */
	output: RenderTarget;
	/**
	 * Runtime render targets snapshot.
	 */
	targets: Readonly<Record<string, RenderTarget>>;
	/**
	 * Frame timestamp in seconds.
	 */
	time: number;
	/**
	 * Frame delta in seconds.
	 */
	delta: number;
	/**
	 * Frame width in pixels.
	 */
	width: number;
	/**
	 * Frame height in pixels.
	 */
	height: number;
	/**
	 * Begins a color render pass targeting current output (or provided view).
	 */
	beginRenderPass: (options?: {
		view?: GPUTextureView;
		clear?: boolean;
		clearColor?: [number, number, number, number];
		preserve?: boolean;
	}) => GPURenderPassEncoder;
}

/**
 * Context provided to compute pass render calls.
 */
export interface ComputePassContext {
	/**
	 * Active GPU device.
	 */
	device: GPUDevice;
	/**
	 * Shared command encoder for this frame.
	 */
	commandEncoder: GPUCommandEncoder;
	/**
	 * Frame width in pixels.
	 */
	width: number;
	/**
	 * Frame height in pixels.
	 */
	height: number;
	/**
	 * Frame timestamp in seconds.
	 */
	time: number;
	/**
	 * Frame delta in seconds.
	 */
	delta: number;
	/**
	 * Begins a compute pass on the shared command encoder.
	 */
	beginComputePass: () => GPUComputePassEncoder;
}

/**
 * Formal render pass contract used by MotionGPU render graph.
 */
export interface RenderPass extends RenderPassFlags {
	/**
	 * Enables/disables this pass without removing it from graph.
	 */
	enabled?: boolean;
	/**
	 * Triggers source/target ping-pong swap after render.
	 */
	needsSwap?: boolean;
	/**
	 * Input slot used by this pass.
	 */
	input?: RenderPassInputSlot;
	/**
	 * Output slot written by this pass.
	 */
	output?: RenderPassOutputSlot;
	/**
	 * Called on resize events (canvas size * DPR changes).
	 */
	setSize?: (width: number, height: number) => void;
	/**
	 * Executes pass commands for current frame.
	 */
	render: (context: RenderPassContext) => void;
	/**
	 * Releases pass-owned resources.
	 */
	dispose?: () => void;
}

/**
 * Minimal interface for compute passes in the render graph.
 * Compute passes do not participate in slot routing.
 */
export interface ComputePassLike {
	readonly isCompute: true;
	enabled?: boolean;
	setSize?: (width: number, height: number) => void;
	dispose?: () => void;
}

/**
 * Union type for all pass types accepted by the render graph.
 */
export type AnyPass = RenderPass | ComputePassLike;

/**
 * Frame submission strategy for the scheduler.
 */
export type RenderMode = 'always' | 'on-demand' | 'manual';

/**
 * Token identifying an invalidation source.
 */
export type FrameInvalidationToken = string | number | symbol;

/**
 * Mutable per-frame state passed to frame callbacks.
 */
export interface FrameState {
	/**
	 * Elapsed time in seconds.
	 */
	time: number;
	/**
	 * Delta time in seconds.
	 */
	delta: number;
	/**
	 * Sets a uniform value for current/next frame.
	 */
	setUniform: (name: string, value: UniformValue) => void;
	/**
	 * Sets a texture value for current/next frame.
	 */
	setTexture: (name: string, value: TextureValue) => void;
	/**
	 * Writes data to a named storage buffer.
	 */
	writeStorageBuffer: (name: string, data: ArrayBufferView, options?: { offset?: number }) => void;
	/**
	 * Async readback of storage buffer data.
	 */
	readStorageBuffer: (name: string) => Promise<ArrayBuffer>;
	/**
	 * Invalidates frame for on-demand rendering.
	 */
	invalidate: (token?: FrameInvalidationToken) => void;
	/**
	 * Requests a single render in manual mode.
	 */
	advance: () => void;
	/**
	 * Current render mode.
	 */
	renderMode: RenderMode;
	/**
	 * Whether automatic rendering is enabled.
	 */
	autoRender: boolean;
	/**
	 * Active canvas element.
	 */
	canvas: HTMLCanvasElement;
}

/**
 * Internal renderer construction options resolved from material/context state.
 */
/**
 * Pending storage buffer write queued from FrameState.
 */
export interface PendingStorageWrite {
	/** Storage buffer name. */
	name: string;
	/** Data to write. */
	data: ArrayBufferView;
	/** Byte offset into the storage buffer. */
	offset: number;
}

export interface RendererOptions {
	/**
	 * Target canvas.
	 */
	canvas: HTMLCanvasElement;
	/**
	 * Resolved fragment WGSL.
	 */
	fragmentWgsl: string;
	/**
	 * 1-based source map for preprocessed fragment lines.
	 */
	fragmentLineMap: Array<{
		kind: 'fragment' | 'include' | 'define';
		line: number;
		include?: string;
		define?: string;
	} | null>;
	/**
	 * Original material fragment source before preprocessing.
	 */
	fragmentSource: string;
	/**
	 * Include sources used while preprocessing material fragment.
	 */
	includeSources: Record<string, string>;
	/**
	 * Deterministic define block source used for diagnostics mapping.
	 */
	defineBlockSource?: string;
	/**
	 * Optional material callsite/source metadata for diagnostics.
	 */
	materialSource?: {
		component?: string;
		file?: string;
		line?: number;
		column?: number;
		functionName?: string;
	} | null;
	/**
	 * Stable material signature captured during resolution.
	 */
	materialSignature?: string;
	/**
	 * Resolved uniform layout.
	 */
	uniformLayout: UniformLayout;
	/**
	 * Sorted texture keys.
	 */
	textureKeys: string[];
	/**
	 * Texture definitions by key.
	 */
	textureDefinitions: TextureDefinitionMap;
	/**
	 * Sorted storage buffer keys.
	 */
	storageBufferKeys?: string[];
	/**
	 * Storage buffer definitions by key.
	 */
	storageBufferDefinitions?: Record<string, import('./types.js').StorageBufferDefinition>;
	/**
	 * Sorted storage texture keys (textures with storage:true).
	 */
	storageTextureKeys?: string[];
	/**
	 * Static render target definitions.
	 */
	renderTargets?: RenderTargetDefinitionMap;
	/**
	 * Static render and compute passes.
	 */
	passes?: AnyPass[];
	/**
	 * Dynamic render targets provider.
	 */
	getRenderTargets?: () => RenderTargetDefinitionMap | undefined;
	/**
	 * Dynamic render and compute passes provider.
	 */
	getPasses?: () => AnyPass[] | undefined;
	/**
	 * Requested output color space.
	 */
	outputColorSpace: OutputColorSpace;
	/**
	 * Function returning current clear color.
	 */
	getClearColor: () => [number, number, number, number];
	/**
	 * Function returning current DPR multiplier.
	 */
	getDpr: () => number;
	/**
	 * Optional adapter request options.
	 */
	adapterOptions?: GPURequestAdapterOptions | undefined;
	/**
	 * Optional device descriptor.
	 */
	deviceDescriptor?: GPUDeviceDescriptor | undefined;
	/**
	 * Optional callback the renderer invokes when an asynchronously detected
	 * compute shader compilation result becomes available. Hosts should treat
	 * this as a hint to schedule another render pass so that the next call to
	 * `Renderer.render` can surface a freshly cached compilation error or use
	 * a freshly validated compute pipeline.
	 */
	requestRender?: (() => void) | undefined;
	/**
	 * Internal test hook invoked when an initialization cleanup is registered.
	 *
	 * @internal
	 */
	__onInitializationCleanupRegistered?: (() => void) | undefined;
}

/**
 * Low-level renderer lifecycle contract used by `FragCanvas`.
 */
export interface Renderer {
	/**
	 * Renders one frame.
	 */
	render: (input: {
		time: number;
		delta: number;
		renderMode: RenderMode;
		uniforms: UniformMap;
		textures: TextureMap;
		canvasSize?: {
			width: number;
			height: number;
		};
		pendingStorageWrites?: PendingStorageWrite[] | undefined;
	}) => void;
	/**
	 * Returns the GPU buffer for a named storage buffer, if allocated.
	 */
	getStorageBuffer?: (name: string) => GPUBuffer | undefined;
	/**
	 * Returns the active GPU device (for readback operations).
	 */
	getDevice?: () => GPUDevice;
	/**
	 * Releases GPU resources and subscriptions.
	 */
	destroy: () => void;
}
