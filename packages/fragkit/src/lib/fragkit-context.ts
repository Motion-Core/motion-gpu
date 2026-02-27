import { getContext, setContext } from 'svelte';
import type { RenderMode } from './core/types';
import type { CurrentReadable, CurrentWritable } from './current-writable';
import type {
	FrameProfilingSnapshot,
	FrameRegistry,
	FrameRunTimings,
	FrameScheduleSnapshot
} from './frame-context';

/**
 * Svelte context key used to expose `FragCanvas` runtime state.
 */
const FRAGKIT_CONTEXT_KEY = Symbol('fragkit.context');

/**
 * Exposed subset of frame scheduler controls intended for public consumption.
 */
export type FragkitScheduler = Pick<
	FrameRegistry,
	| 'createStage'
	| 'getStage'
	| 'setDiagnosticsEnabled'
	| 'getDiagnosticsEnabled'
	| 'getLastRunTimings'
	| 'getSchedule'
	| 'setProfilingEnabled'
	| 'setProfilingWindow'
	| 'resetProfiling'
	| 'getProfilingEnabled'
	| 'getProfilingWindow'
	| 'getProfilingSnapshot'
>;
export type { FrameProfilingSnapshot, FrameRunTimings, FrameScheduleSnapshot };

/**
 * Namespace identifier for user-owned context entries.
 */
export type FragkitUserNamespace = string | symbol;

/**
 * Shared user context store exposed by `FragCanvas`.
 */
export type FragkitUserContext = CurrentWritable<Record<FragkitUserNamespace, unknown>>;

/**
 * Public `FragCanvas` runtime context available to hooks and user components.
 */
export interface FragkitContext {
	/**
	 * Underlying canvas element used by the renderer.
	 */
	canvas: HTMLCanvasElement | undefined;
	/**
	 * Reactive canvas pixel size.
	 */
	size: CurrentReadable<{ width: number; height: number }>;
	/**
	 * Device pixel ratio multiplier.
	 */
	dpr: CurrentWritable<number>;
	/**
	 * Max frame delta clamp passed to scheduled callbacks.
	 */
	maxDelta: CurrentWritable<number>;
	/**
	 * Scheduler render mode (`always`, `on-demand`, `manual`).
	 */
	renderMode: CurrentWritable<RenderMode>;
	/**
	 * Global toggle for automatic rendering.
	 */
	autoRender: CurrentWritable<boolean>;
	/**
	 * Namespaced user context store shared within the canvas subtree.
	 */
	user: FragkitUserContext;
	/**
	 * Marks current frame as invalidated.
	 */
	invalidate: () => void;
	/**
	 * Requests one manual frame advance.
	 */
	advance: () => void;
	/**
	 * Public scheduler API.
	 */
	scheduler: FragkitScheduler;
}

/**
 * Registers the fragkit context in the current Svelte component tree.
 *
 * @param context - Context payload to provide.
 */
export function provideFragkitContext(context: FragkitContext): void {
	setContext(FRAGKIT_CONTEXT_KEY, context);
}

/**
 * Returns the active fragkit context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useFragkit(): FragkitContext {
	const context = getContext<FragkitContext>(FRAGKIT_CONTEXT_KEY);
	if (!context) {
		throw new Error('useFragkit must be used inside <FragCanvas>');
	}

	return context;
}
