import { createContext, useContext } from 'react';
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
 * Internal React context container.
 */
export const SpektralReactContext = createContext<SpektralContext | null>(null);

/**
 * Returns active Spektral runtime context.
 *
 * @returns Active context.
 * @throws {Error} When called outside `<FragCanvas>`.
 */
export function useSpektral(): SpektralContext {
	const context = useContext(SpektralReactContext);
	if (!context) {
		throw new Error('useSpektral must be used inside <FragCanvas>');
	}

	return context;
}
