import { assertComputeContract, extractWorkgroupSize } from '../core/compute-shader.js';
import type { ComputePassOptions, ComputeDispatchContext } from './ComputePass.js';

/**
 * Options for constructing a `PingPongComputePass`.
 */
export interface PingPongComputePassOptions {
	/**
	 * Compute shader WGSL source code.
	 */
	compute: string;
	/**
	 * Target texture key from `material.textures`.
	 * The engine will auto-generate `{target}A` and `{target}B` bindings.
	 */
	target: string;
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
	private target: string;
	private iterations: number;
	private dispatch: ComputePassOptions['dispatch'];
	private workgroupSize: [number, number, number];
	private frameCount: number = 0;

	constructor(options: PingPongComputePassOptions) {
		assertComputeContract(options.compute);
		const workgroupSize = extractWorkgroupSize(options.compute);
		this.compute = options.compute;
		this.target = options.target;
		this.iterations = PingPongComputePass.assertIterations(options.iterations ?? 1);
		this.dispatch = options.dispatch ?? 'auto';
		this.enabled = options.enabled ?? true;
		this.workgroupSize = workgroupSize;
	}

	private static assertIterations(count: number): number {
		if (!Number.isFinite(count) || count < 1 || !Number.isInteger(count)) {
			throw new Error(
				`PingPongComputePass iterations must be a positive integer >= 1, got ${count}`
			);
		}
		return count;
	}

	/**
	 * Returns the texture key holding the latest result.
	 * Alternates between `{target}A` and `{target}B` based on total iteration parity.
	 */
	getCurrentOutput(): string {
		const totalIterations = this.frameCount * this.iterations;
		return totalIterations % 2 === 0 ? `${this.target}A` : `${this.target}B`;
	}

	/**
	 * Advances the internal frame counter (called by renderer after each frame's iterations).
	 */
	advanceFrame(): void {
		this.frameCount += 1;
	}

	/**
	 * Replaces compute shader and updates workgroup size.
	 */
	setCompute(compute: string): void {
		assertComputeContract(compute);
		const workgroupSize = extractWorkgroupSize(compute);
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
	 * Returns the target texture key.
	 */
	getTarget(): string {
		return this.target;
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
