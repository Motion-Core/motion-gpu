/**
 * React adapter entrypoint for MotionGPU.
 */
export { FragCanvas } from './FragCanvas.js';
export { defineMaterial } from '../core/material.js';
export { BlitPass, CopyPass, ShaderPass } from '../passes/index.js';
export { useMotionGPU } from './motiongpu-context.js';
export { useFrame } from './frame-context.js';
export { useTexture } from './use-texture.js';
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
} from '../core/types.js';
export type {
	LoadedTexture,
	TextureDecodeOptions,
	TextureLoadOptions
} from '../core/texture-loader.js';
export type {
	FragMaterial,
	FragMaterialInput,
	MaterialIncludes,
	MaterialDefineValue,
	MaterialDefines,
	TypedMaterialDefineValue
} from '../core/material.js';
export type { MotionGPUContext } from './motiongpu-context.js';
export type { UseFrameOptions, UseFrameResult } from './frame-context.js';
export type { TextureUrlInput, UseTextureResult } from './use-texture.js';
