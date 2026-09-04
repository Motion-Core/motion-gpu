import { getContext, setContext } from 'svelte';
import type { SpektralContext } from '../core/spektral-context.js';
export type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot,
	SpektralContext,
	SpektralGraph,
	SpektralScheduler,
	SpektralUserContext,
	SpektralUserNamespace
} from '../core/spektral-context.js';

/**
 * Svelte context key used to expose `FragCanvas` runtime state.
 */
const SPEKTRAL_CONTEXT_KEY = Symbol('spektral.context');

/**
 * Registers the spektral context in the current Svelte component tree.
 *
 * @param context - Context payload to provide.
 */
export function provideSpektralContext(context: SpektralContext): void {
	setContext(SPEKTRAL_CONTEXT_KEY, context);
}

/**
 * Returns the active spektral context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useSpektral(): SpektralContext {
	const context = getContext<SpektralContext>(SPEKTRAL_CONTEXT_KEY);
	if (!context) {
		throw new Error('useSpektral must be used inside <FragCanvas>');
	}

	return context;
}
