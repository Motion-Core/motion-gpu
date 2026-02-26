import { getContext, onDestroy, setContext } from 'svelte';
import type { FrameState } from './core/types';

export type FrameCallback = (state: FrameState) => void;

const FRAME_CONTEXT_KEY = Symbol('fragkit.frame-context');

export interface FrameRegistry {
	register: (callback: FrameCallback) => () => void;
	run: (state: FrameState) => void;
	clear: () => void;
}

export function createFrameRegistry(): FrameRegistry {
	const callbacks = new Set<FrameCallback>();

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
