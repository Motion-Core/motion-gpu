import { onBeforeUnmount, onMounted, watchEffect } from 'vue';
import {
	createPointerController,
	type PointerControllerOptions,
	type PointerControllerResult
} from '../core/pointer.js';
import { useMotionGPU } from './motiongpu-context.js';

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
	const stopOptionsWatch = watchEffect(() => {
		controller.updateOptions(resolveOptions(options));
	});

	onMounted(() => {
		const canvas = motiongpu.canvas;
		if (canvas) {
			controller.mount(canvas);
		}
	});
	onBeforeUnmount(() => {
		stopOptionsWatch();
		controller.destroy();
	});

	return controller;
}
