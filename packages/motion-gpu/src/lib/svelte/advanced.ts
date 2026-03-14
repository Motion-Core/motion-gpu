/**
 * Svelte adapter advanced entrypoint for MotionGPU.
 */
export * from './index';
export { applySchedulerPreset, captureSchedulerDebugSnapshot } from '../core/scheduler-helpers';
export { setMotionGPUUserContext, useMotionGPUUserContext } from './use-motiongpu-user-context';
export type {
	ApplySchedulerPresetOptions,
	SchedulerDebugSnapshot,
	SchedulerPreset,
	SchedulerPresetConfig
} from '../core/scheduler-helpers';
export type { MotionGPUUserContext, MotionGPUUserNamespace } from './motiongpu-context';
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
} from '../core/frame-registry';
export type { SetMotionGPUUserContextOptions } from './use-motiongpu-user-context';
export type {
	RenderPassContext,
	RenderTarget,
	UniformLayout,
	UniformLayoutEntry
} from '../core/types';
