import type { RuntimeTextureResource } from '../resource-registry.js';
import type {
	AnyPass,
	RenderPass,
	TextureSource,
	TextureUpdateMode,
	TextureValue
} from '../types.js';

/** Runtime texture binding state associated with a single texture key. */
export interface RuntimeTextureBinding {
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

/** Runtime render target allocation metadata. */
export interface RuntimeRenderTarget {
	texture: GPUTexture;
	view: GPUTextureView;
	width: number;
	height: number;
	format: GPUTextureFormat;
}

/** Cached pass properties used to validate render-graph cache correctness. */
export interface RenderGraphPassSnapshot {
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
