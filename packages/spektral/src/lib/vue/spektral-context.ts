import { inject, provide, type InjectionKey } from 'vue';
import type { SpektralContext } from '../core/spektral-context.js';
export type {
	FrameProfilingSnapshot,
	FrameRunTimings,
	FrameScheduleSnapshot,
	SpektralContext,
	SpektralScheduler,
	SpektralUserContext,
	SpektralUserNamespace
} from '../core/spektral-context.js';

/**
 * Vue injection key used to expose `FragCanvas` runtime state.
 */
export const spektralContextKey: InjectionKey<SpektralContext> = Symbol('spektral.context');

/**
 * Registers the spektral context in the current Vue component tree.
 *
 * @param context - Context payload to provide.
 */
export function provideSpektralContext(context: SpektralContext): void {
	provide(spektralContextKey, context);
}

/**
 * Returns the active spektral context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useSpektral(): SpektralContext {
	const context = inject(spektralContextKey, null);
	if (!context) {
		throw new Error('useSpektral must be used inside <FragCanvas>');
	}

	return context;
}
