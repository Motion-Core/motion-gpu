import type {
	FrameCallback,
	FrameKey,
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot,
	FrameStage,
	FrameStageCallback,
	FrameTask,
	FrameTaskInvalidation,
	FrameTaskInvalidationToken,
	UseFrameOptions,
	UseFrameResult
} from '../core/frame-registry.js';

export type {
	FrameCallback,
	FrameKey,
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot,
	FrameStage,
	FrameStageCallback,
	FrameTask,
	FrameTaskInvalidation,
	FrameTaskInvalidationToken,
	UseFrameOptions,
	UseFrameResult
};

/**
 * Registers a frame callback using an auto-generated task key.
 */
export function useFrame(callback: FrameCallback, options?: UseFrameOptions): UseFrameResult;

/**
 * Registers a frame callback with an explicit task key.
 */
export function useFrame(
	key: FrameKey,
	callback: FrameCallback,
	options?: UseFrameOptions
): UseFrameResult;

/**
 * React implementation placeholder. Full runtime wiring is implemented in a follow-up step.
 */
export function useFrame(
	keyOrCallback: FrameKey | FrameCallback,
	callbackOrOptions?: FrameCallback | UseFrameOptions,
	maybeOptions?: UseFrameOptions
): UseFrameResult {
	void keyOrCallback;
	void callbackOrOptions;
	void maybeOptions;
	throw new Error('useFrame is not implemented yet');
}
