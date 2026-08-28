import { createMotionGPUError } from './error-report.js';
import { managedPassBrand } from './pass-brand.js';
import type { AnyPass, ComputePassLike, PingPongShaderPassLike, RenderPass } from './types.js';

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/** Reports whether a value is a renderer-managed compute pass. */
export function isManagedComputePass(value: unknown): value is ComputePassLike {
	return isRecord(value) && value[managedPassBrand] === 'compute' && value.isCompute === true;
}

/** Reports whether a value is a renderer-managed fragment-feedback pass. */
export function isManagedFeedbackPass(value: unknown): value is PingPongShaderPassLike {
	return (
		isRecord(value) && value[managedPassBrand] === 'feedback' && value.isPingPongShader === true
	);
}

/**
 * Validates the public JavaScript boundary before a pass enters graph planning.
 * Compute and feedback passes are nominal; custom render passes remain structural.
 */
export function assertMotionGPUPass(value: unknown): asserts value is AnyPass {
	if (isManagedComputePass(value) || isManagedFeedbackPass(value)) {
		return;
	}

	if (!isRecord(value)) {
		throw createMotionGPUError('RENDER_GRAPH_INVALID', 'A render graph pass must be an object.');
	}

	if (value.isCompute === true) {
		throw createMotionGPUError(
			'RENDER_GRAPH_INVALID',
			'Objects with isCompute: true are not custom compute passes. Use ComputePass or PingPongComputePass.'
		);
	}

	if (value.isPingPongShader === true) {
		throw createMotionGPUError(
			'RENDER_GRAPH_INVALID',
			'Objects with isPingPongShader: true are not custom feedback passes. Use PingPongShaderPass.'
		);
	}

	if (value[managedPassBrand] !== undefined) {
		throw createMotionGPUError(
			'RENDER_GRAPH_INVALID',
			'MotionGPU-managed pass has an invalid internal contract.'
		);
	}

	if (typeof (value as unknown as RenderPass).render !== 'function') {
		throw createMotionGPUError(
			'RENDER_GRAPH_INVALID',
			'A custom RenderPass must provide render(context).'
		);
	}
}
