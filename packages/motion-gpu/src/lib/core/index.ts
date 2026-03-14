/**
 * Framework-agnostic MotionGPU core entrypoint.
 *
 * This surface is intended for building framework adapters (Svelte/React/Vue).
 */
export { defineMaterial, resolveMaterial } from './material';
export { toMotionGPUErrorReport } from './error-report';
export { createCurrentWritable } from './current-value';
export { createFrameRegistry } from './frame-registry';
export { createMotionGPURuntimeLoop } from './runtime-loop';
export { loadTexturesFromUrls } from './texture-loader';
export { BlitPass, CopyPass, ShaderPass } from '../passes';
export type { CurrentReadable, CurrentWritable, Subscribable } from './current-value';
export type {
	MotionGPUErrorPhase,
	MotionGPUErrorReport,
	MotionGPUErrorSource,
	MotionGPUErrorSourceLine
} from './error-report';
export type {
	FrameCallback,
	FrameKey,
	FrameProfilingSnapshot,
	FrameRegistry,
	FrameRunTimings,
	FrameScheduleSnapshot,
	FrameStage,
	FrameStageCallback,
	FrameTask,
	FrameTaskInvalidation,
	FrameTaskInvalidationToken,
	FrameTimingStats,
	UseFrameOptions,
	UseFrameResult
} from './frame-registry';
export type {
	FragMaterial,
	FragMaterialInput,
	MaterialDefineValue,
	MaterialDefines,
	MaterialIncludes,
	ResolvedMaterial,
	TypedMaterialDefineValue
} from './material';
export type { MotionGPURuntimeLoop, MotionGPURuntimeLoopOptions } from './runtime-loop';
export type { LoadedTexture, TextureDecodeOptions, TextureLoadOptions } from './texture-loader';
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
	TextureMap,
	TextureSource,
	TextureUpdateMode,
	TextureValue,
	TypedUniform,
	UniformLayout,
	UniformLayoutEntry,
	UniformMap,
	UniformMat4Value,
	UniformType,
	UniformValue
} from './types';
