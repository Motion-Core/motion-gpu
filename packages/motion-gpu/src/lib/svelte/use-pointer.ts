import { onMount } from 'svelte';
import {
	createPointerController,
	type PointerControllerOptions,
	type PointerControllerResult
} from '../core/pointer.js';
import { useMotionGPU } from './motiongpu-context.js';
import { watchPointerOptions } from './pointer-options.svelte.js';

export type {
	PointerClick,
	PointerFrameRequestMode,
	PointerKind,
	PointerPoint,
	PointerState
} from '../core/pointer.js';

/**
 * Configuration for pointer input handling in `usePointer`.
 */
export type UsePointerOptions = PointerControllerOptions;

/**
 * Reactive state returned by `usePointer`.
 */
export type UsePointerResult = PointerControllerResult;

type UsePointerOptionsSource = UsePointerOptions | (() => UsePointerOptions);

function resolveOptions(source: UsePointerOptionsSource): UsePointerOptions {
	return typeof source === 'function' ? source() : source;
}

/**
 * Tracks normalized pointer coordinates and click/tap snapshots for the active `FragCanvas`.
 */
export function usePointer(options: UsePointerOptionsSource = {}): UsePointerResult {
	const motiongpu = useMotionGPU();
	const controller = createPointerController(
		{
			getRenderMode: () => motiongpu.renderMode.current,
			invalidate: motiongpu.invalidate,
			advance: motiongpu.advance
		},
		resolveOptions(options)
	);

	watchPointerOptions(() => {
		controller.updateOptions(resolveOptions(options));
	});

	onMount(() => {
		const canvas = motiongpu.canvas;
		if (!canvas) {
			return;
		}

		controller.mount(canvas);
		return controller.destroy;
	});

	return controller;
}
