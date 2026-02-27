/**
 * Public MotionGPU package entrypoint.
 *
 * Exposes the production-ready core API for fullscreen WGSL rendering workflows.
 */
export { default as FragCanvas } from './FragCanvas.svelte';
export { defineMaterial } from './core/material';
export { BlitPass, CopyPass, ShaderPass } from './passes';
export { useMotionGPU } from './motiongpu-context';
export { useFrame } from './frame-context';
export { useTexture } from './use-texture';
export type {
	FrameInvalidationToken,
	FrameState,
	OutputColorSpace,
	RenderPass,
	RenderPassContext,
	RenderPassFlags,
	RenderPassInputSlot,
	RenderPassOutputSlot,
	RenderMode,
	RenderTarget,
	RenderTargetDefinition,
	RenderTargetDefinitionMap,
	TextureData,
	TextureDefinition,
	TextureDefinitionMap,
	TextureUpdateMode,
	TextureMap,
	TextureSource,
	TextureValue,
	TypedUniform,
	UniformMat4Value,
	UniformMap,
	UniformType,
	UniformValue
} from './core/types';
export type {
	LoadedTexture,
	TextureDecodeOptions,
	TextureLoadOptions
} from './core/texture-loader';
export type {
	FragMaterial,
	FragMaterialInput,
	MaterialIncludes,
	MaterialDefineValue,
	MaterialDefines,
	TypedMaterialDefineValue
} from './core/material';
export type { MotionGPUContext } from './motiongpu-context';
export type { UseFrameOptions, UseFrameResult } from './frame-context';
export type { TextureUrlInput, UseTextureResult } from './use-texture';
