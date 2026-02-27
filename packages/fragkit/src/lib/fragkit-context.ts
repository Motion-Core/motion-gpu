import { getContext, setContext } from 'svelte';
import type { RenderMode } from './core/types';
import type { CurrentReadable, CurrentWritable } from './current-writable';
import type { FrameRegistry } from './frame-context';

const FRAGKIT_CONTEXT_KEY = Symbol('fragkit.context');

export type FragkitScheduler = Pick<FrameRegistry, 'createStage' | 'getStage'>;

export interface FragkitContext {
	canvas: HTMLCanvasElement | undefined;
	size: CurrentReadable<{ width: number; height: number }>;
	dpr: CurrentWritable<number>;
	maxDelta: CurrentWritable<number>;
	renderMode: CurrentWritable<RenderMode>;
	autoRender: CurrentWritable<boolean>;
	invalidate: () => void;
	advance: () => void;
	scheduler: FragkitScheduler;
}

export function provideFragkitContext(context: FragkitContext): void {
	setContext(FRAGKIT_CONTEXT_KEY, context);
}

export function useFragkit(): FragkitContext {
	const context = getContext<FragkitContext>(FRAGKIT_CONTEXT_KEY);
	if (!context) {
		throw new Error('useFragkit must be used inside <FragCanvas>');
	}

	return context;
}
