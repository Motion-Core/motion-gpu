import { onMount } from 'svelte';
import {
	createPointerController,
	type PointerControllerOptions,
	type PointerControllerResult
} from '../core/pointer.js';
import { useSpektral } from './spektral-context.js';
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
	const spektral = useSpektral();
	const controller = createPointerController(
		{
			getRenderMode: () => spektral.renderMode.current,
			invalidate: spektral.invalidate,
			advance: spektral.advance
		},
		resolveOptions(options)
	);

	watchPointerOptions(() => {
		controller.updateOptions(resolveOptions(options));
	});

	onMount(() => {
		const canvas = spektral.canvas;
		if (!canvas) {
			return;
		}

		controller.mount(canvas);
		return controller.destroy;
	});

	return controller;
}
