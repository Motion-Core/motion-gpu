/**
 * Framework-agnostic advanced MotionGPU core entrypoint.
 */
export * from './index.js';
export { applySchedulerPreset, captureSchedulerDebugSnapshot } from './scheduler-helpers.js';
export type {
	ApplySchedulerPresetOptions,
	MotionGPUScheduler,
	SchedulerDebugSnapshot,
	SchedulerPreset,
	SchedulerPresetConfig
} from './scheduler-helpers.js';
