import { getContext, onDestroy, setContext } from 'svelte';
import type { FrameState, RenderMode } from './core/types';

export type FrameCallback = (state: FrameState) => void;

const FRAME_CONTEXT_KEY = Symbol('fragkit.frame-context');

export interface FrameRegistry {
	register: (callback: FrameCallback) => () => void;
	run: (state: FrameState) => void;
	invalidate: () => void;
	advance: () => void;
	shouldRender: () => boolean;
	endFrame: () => void;
	setRenderMode: (mode: RenderMode) => void;
	setAutoRender: (enabled: boolean) => void;
	getRenderMode: () => RenderMode;
	getAutoRender: () => boolean;
	clear: () => void;
}

export function createFrameRegistry(options?: {
	renderMode?: RenderMode;
	autoRender?: boolean;
}): FrameRegistry {
	const callbacks = new Set<FrameCallback>();
	let renderMode: RenderMode = options?.renderMode ?? 'always';
	let autoRender = options?.autoRender ?? true;
	let frameInvalidated = true;
	let shouldAdvance = false;

	return {
		register(callback) {
			callbacks.add(callback);
			return () => callbacks.delete(callback);
		},
		run(state) {
			for (const callback of callbacks) {
				callback(state);
			}
		},
		invalidate() {
			frameInvalidated = true;
		},
		advance() {
			shouldAdvance = true;
			frameInvalidated = true;
		},
		shouldRender() {
			if (!autoRender) {
				return false;
			}

			if (renderMode === 'always') {
				return true;
			}

			if (renderMode === 'on-demand') {
				return frameInvalidated;
			}

			return shouldAdvance;
		},
		endFrame() {
			frameInvalidated = false;
			shouldAdvance = false;
		},
		setRenderMode(mode) {
			renderMode = mode;
		},
		setAutoRender(enabled) {
			autoRender = enabled;
		},
		getRenderMode() {
			return renderMode;
		},
		getAutoRender() {
			return autoRender;
		},
		clear() {
			callbacks.clear();
		}
	};
}

export function provideFrameRegistry(registry: FrameRegistry): void {
	setContext(FRAME_CONTEXT_KEY, registry);
}

export function useFrame(callback: FrameCallback): () => void {
	const registry = getContext<FrameRegistry>(FRAME_CONTEXT_KEY);
	if (!registry) {
		throw new Error('useFrame must be used inside <FragCanvas>');
	}

	const unsubscribe = registry.register(callback);
	onDestroy(unsubscribe);
	return unsubscribe;
}
