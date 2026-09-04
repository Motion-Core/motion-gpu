/**
 * Svelte adapter advanced entrypoint for Spektral.
 */
export * from './index.js';
export { applySchedulerPreset, captureSchedulerDebugSnapshot } from '../core/scheduler-helpers.js';
export { setSpektralUserContext, useSpektralUserContext } from './use-spektral-user-context.js';
export type {
	ApplySchedulerPresetOptions,
	SchedulerDebugSnapshot,
	SchedulerPreset,
	SchedulerPresetConfig
} from '../core/scheduler-helpers.js';
export type { SpektralUserContext, SpektralUserNamespace } from './spektral-context.js';
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
export type { SetSpektralUserContextOptions } from './use-spektral-user-context.js';
export type {
	RenderPassContext,
	RenderTarget,
	UniformLayout,
	UniformLayoutEntry
} from '../core/types.js';
