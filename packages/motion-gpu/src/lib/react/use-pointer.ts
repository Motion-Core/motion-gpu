import { useEffect, useRef } from 'react';
import {
	createPointerController,
	type PointerController,
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

/**
 * Tracks normalized pointer coordinates and click/tap snapshots for the active `FragCanvas`.
 */
export function usePointer(options: UsePointerOptions = {}): UsePointerResult {
	const motiongpu = useMotionGPU();
	const motiongpuRef = useRef(motiongpu);
	const controllerRef = useRef<PointerController | null>(null);
	motiongpuRef.current = motiongpu;

	if (!controllerRef.current) {
		controllerRef.current = createPointerController(
			{
				getRenderMode: () => motiongpuRef.current.renderMode.current,
				invalidate: () => motiongpuRef.current.invalidate(),
				advance: () => motiongpuRef.current.advance()
			},
			options
		);
	}

	const controller = controllerRef.current;
	const canvas = motiongpu.canvas;

	useEffect(() => {
		controller.updateOptions(options);
	});

	useEffect(() => {
		if (!canvas) {
			return;
		}

		controller.mount(canvas);
		return controller.destroy;
	}, [canvas, controller]);

	return controller;
}
