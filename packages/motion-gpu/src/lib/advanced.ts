/**
 * Advanced MotionGPU entrypoint.
 *
 * Includes power-user hooks and diagnostics-oriented types that are not part of the
 * minimal root API surface.
 */
export * from './index';
export { useMotionGPUUserContext } from './use-motiongpu-user-context';
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
} from './frame-context';
export type { SetMotionGPUUserContextOptions } from './use-motiongpu-user-context';
export type {
	RenderPassContext,
	RenderTarget,
	UniformLayout,
	UniformLayoutEntry
} from './core/types';
