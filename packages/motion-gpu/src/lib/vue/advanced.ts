/**
 * Vue adapter advanced entrypoint for MotionGPU.
 */
export * from './index.js';
export { applySchedulerPreset, captureSchedulerDebugSnapshot } from '../core/scheduler-helpers.js';
export { setMotionGPUUserContext, useMotionGPUUserContext } from './use-motiongpu-user-context.js';
export type {
	ApplySchedulerPresetOptions,
	SchedulerDebugSnapshot,
	SchedulerPreset,
	SchedulerPresetConfig
} from '../core/scheduler-helpers.js';
export type { MotionGPUUserContext, MotionGPUUserNamespace } from './motiongpu-context.js';
export type {
	FrameProfilingSnapshot,
	FrameKey,
	FrameTaskInvalidation,
	FrameTaskInvalidationToken,
	FrameRunTimings,
	FrameScheduleSnapshot,
	FrameStage,
	FrameStageCallback,
	FrameTimingStats,
	FrameTask
} from '../core/frame-registry.js';
export type { SetMotionGPUUserContextOptions } from './use-motiongpu-user-context.js';
export type {
	RenderPassContext,
	RenderTarget,
	UniformLayout,
	UniformLayoutEntry
} from '../core/types.js';
