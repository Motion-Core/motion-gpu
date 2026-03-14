/**
 * Framework-agnostic MotionGPU core entrypoint.
 *
 * This surface is intended for building framework adapters (Svelte/React/Vue).
 */
export { defineMaterial, resolveMaterial } from './material.js';
export { toMotionGPUErrorReport } from './error-report.js';
export { createCurrentWritable } from './current-value.js';
export { createFrameRegistry } from './frame-registry.js';
export { createMotionGPURuntimeLoop } from './runtime-loop.js';
export { loadTexturesFromUrls } from './texture-loader.js';
export { BlitPass, CopyPass, ShaderPass } from '../passes/index.js';
export type { CurrentReadable, CurrentWritable, Subscribable } from './current-value.js';
export type {
	MotionGPUErrorPhase,
	MotionGPUErrorReport,
	MotionGPUErrorSource,
	MotionGPUErrorSourceLine
} from './error-report.js';
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
} from './frame-registry.js';
export type {
	FragMaterial,
	FragMaterialInput,
	MaterialDefineValue,
	MaterialDefines,
	MaterialIncludes,
	ResolvedMaterial,
	TypedMaterialDefineValue
} from './material.js';
export type { MotionGPURuntimeLoop, MotionGPURuntimeLoopOptions } from './runtime-loop.js';
export type { LoadedTexture, TextureDecodeOptions, TextureLoadOptions } from './texture-loader.js';
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
} from './types.js';
