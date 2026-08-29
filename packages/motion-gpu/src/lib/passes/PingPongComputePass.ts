import {
	assertComputeContract,
	resolveWorkgroupSize,
	type ComputeWorkgroupSize
} from '../core/compute-shader.js';
import {
	copyComputeResourceMap,
	normalizeComputeResourceMap,
	resolveComputePingPongResourcePair
} from '../core/compute-resources.js';
import { createMotionGPUError } from '../core/error-report.js';
import { managedPassBrand } from '../core/pass-brand.js';
import type { ComputeResourceMap } from '../core/types.js';
import type { ComputePassOptions, ComputeDispatchContext } from './ComputePass.js';

/**
 * Options for constructing a `PingPongComputePass`.
 */
export interface PingPongComputePassOptions {
	/**
	 * Compute shader WGSL source code.
	 */
	compute: string;
	/** Explicit size for override/non-literal `@workgroup_size` expressions. */
	workgroupSize?: ComputeWorkgroupSize;
	/**
	 * Pass-local resources keyed by their WGSL binding aliases.
	 * Must contain one sampled `pingPong: 'read'` descriptor and one
	 * storage-write `pingPong: 'write'` descriptor for the same texture.
	 */
	resources: ComputeResourceMap;
	/**
	 * Number of compute iterations per frame. Default: 1.
	 */
	iterations?: number;
	/**
	 * Dispatch workgroup counts (same as ComputePass).
	 */
	dispatch?: ComputePassOptions['dispatch'];
	/**
	 * Enables/disables this pass.
	 */
	enabled?: boolean;
}

/**
 * Ping-pong compute pass for iterative GPU simulations.
 *
 * Manages two texture buffers (A/B) and alternates between them each iteration,
 * enabling read-from-previous-write patterns commonly used in fluid simulations,
 * reaction-diffusion, and particle systems.
 */
export class PingPongComputePass {
	/** Internal nominal marker for renderer-managed compute passes. */
	readonly [managedPassBrand] = 'compute' as const;

	/**
	 * Enables/disables this pass without removing it from graph.
	 */
	enabled: boolean;

	/**
	 * Discriminant flag for render graph to identify compute passes.
	 */
	readonly isCompute = true as const;

	/**
	 * Discriminant flag to identify ping-pong compute passes.
	 */
	readonly isPingPong = true as const;

	private compute: string;
	private readonly resources: ComputeResourceMap;
	private iterations: number;
	private dispatch: ComputePassOptions['dispatch'];
	private workgroupSize: [number, number, number];

	constructor(options: PingPongComputePassOptions) {
		assertComputeContract(options.compute, options.workgroupSize);
		const workgroupSize = resolveWorkgroupSize(options.compute, options.workgroupSize);
		const resources = normalizeComputeResourceMap(options.resources);
		try {
			resolveComputePingPongResourcePair(resources);
		} catch (error) {
			throw createMotionGPUError(
				'PINGPONG_CONFIGURATION_INVALID',
				error instanceof Error
					? error.message
					: 'PingPongComputePass resource pair configuration is invalid.',
				{ cause: error }
			);
		}
		this.compute = options.compute;
		this.resources = resources;
		this.iterations = PingPongComputePass.assertIterations(options.iterations ?? 1);
		this.dispatch = options.dispatch ?? 'auto';
		this.enabled = options.enabled ?? true;
		this.workgroupSize = workgroupSize;
	}

	private static assertIterations(count: number): number {
		if (!Number.isFinite(count) || count < 1 || !Number.isInteger(count)) {
			throw createMotionGPUError(
				'PINGPONG_CONFIGURATION_INVALID',
				`PingPongComputePass iterations must be a positive integer >= 1, got ${count}`
			);
		}
		return count;
	}

	/**
	 * Replaces compute shader and updates workgroup size.
	 */
	setCompute(compute: string, options?: { workgroupSize?: ComputeWorkgroupSize }): void {
		assertComputeContract(compute, options?.workgroupSize);
		const workgroupSize = resolveWorkgroupSize(compute, options?.workgroupSize);
		this.compute = compute;
		this.workgroupSize = workgroupSize;
	}

	/**
	 * Updates iteration count.
	 *
	 * @param count - Must be >= 1.
	 */
	setIterations(count: number): void {
		this.iterations = PingPongComputePass.assertIterations(count);
	}

	/**
	 * Updates dispatch strategy.
	 */
	setDispatch(dispatch: ComputePassOptions['dispatch']): void {
		this.dispatch = dispatch ?? 'auto';
	}

	/**
	 * Returns the current iteration count.
	 */
	getIterations(): number {
		return this.iterations;
	}

	/**
	 * Returns current compute shader source.
	 */
	getCompute(): string {
		return this.compute;
	}

	/**
	 * Returns a defensive copy of the immutable pass resource topology.
	 */
	getResources(): ComputeResourceMap {
		return copyComputeResourceMap(this.resources);
	}

	/**
	 * Returns parsed workgroup size.
	 */
	getWorkgroupSize(): [number, number, number] {
		return [...this.workgroupSize];
	}

	/**
	 * Resolves dispatch workgroup counts for current frame.
	 */
	resolveDispatch(ctx: ComputeDispatchContext): [number, number, number] {
		if (this.dispatch === 'auto') {
			return [
				Math.ceil(ctx.width / this.workgroupSize[0]),
				Math.ceil(ctx.height / this.workgroupSize[1]),
				Math.ceil(1 / this.workgroupSize[2])
			];
		}

		if (typeof this.dispatch === 'function') {
			return this.dispatch(ctx);
		}

		if (Array.isArray(this.dispatch)) {
			return [this.dispatch[0], this.dispatch[1] ?? 1, this.dispatch[2] ?? 1];
		}

		return [1, 1, 1];
	}

	/**
	 * Releases resources (no-op, GPU lifecycle is renderer-managed).
	 */
	dispose(): void {
		// No-op
	}
}
