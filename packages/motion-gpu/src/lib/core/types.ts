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
export interface TypedUniform<TType extends UniformType = UniformType, TValue = unknown> {
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
 * Accepted matrix value formats for `mat4x4f` uniforms.
 */
export type UniformMat4Value = number[] | Float32Array;

/**
 * Supported uniform input shapes accepted by material and render APIs.
 */
export type UniformValue =
	| number
	| [number, number]
	| [number, number, number]
	| [number, number, number, number]
	| TypedUniform<'f32', number>
	| TypedUniform<'vec2f', [number, number]>
	| TypedUniform<'vec3f', [number, number, number]>
	| TypedUniform<'vec4f', [number, number, number, number]>
	| TypedUniform<'mat4x4f', UniformMat4Value>;

/**
 * Uniform map keyed by WGSL identifier names.
 */
export type UniformMap = Record<string, UniformValue>;

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
}

/**
 * Texture definition map keyed by uniform-compatible texture names.
 */
export type TextureDefinitionMap = Record<string, TextureDefinition>;

/**
 * Runtime texture value map keyed by texture uniform names.
 */
export type TextureMap = Record<string, TextureValue>;

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
export type RenderTargetDefinitionMap = Record<string, RenderTargetDefinition>;

/**
 * Built-in render graph source slots.
 */
export type RenderPassInputSlot = 'source' | 'target';

/**
 * Built-in render graph output slots.
 */
export type RenderPassOutputSlot = 'source' | 'target' | 'canvas';

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
	 * Static render target definitions.
	 */
	renderTargets?: RenderTargetDefinitionMap;
	/**
	 * Static render passes.
	 */
	passes?: RenderPass[];
	/**
	 * Dynamic render targets provider.
	 */
	getRenderTargets?: () => RenderTargetDefinitionMap;
	/**
	 * Dynamic render passes provider.
	 */
	getPasses?: () => RenderPass[];
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
	}) => void;
	/**
	 * Releases GPU resources and subscriptions.
	 */
	destroy: () => void;
}
