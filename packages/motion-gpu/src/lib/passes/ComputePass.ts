import { assertComputeContract, extractWorkgroupSize } from '../core/compute-shader.js';

/**
 * Dispatch context provided to dynamic dispatch callbacks.
 */
export interface ComputeDispatchContext {
	width: number;
	height: number;
	time: number;
	delta: number;
	workgroupSize: [number, number, number];
}

/**
 * Options for constructing a `ComputePass`.
 */
export interface ComputePassOptions {
	/**
	 * Compute shader WGSL source code.
	 * Must declare `@compute @workgroup_size(...) fn compute(@builtin(global_invocation_id) ...)`.
	 */
	compute: string;
	/**
	 * Dispatch workgroup counts.
	 * - Static tuple: `[x]`, `[x, y]`, or `[x, y, z]`
	 * - `'auto'`: derived from canvas size / workgroup size
	 * - Function: dynamic dispatch based on frame context
	 */
	dispatch?:
		| [number, number?, number?]
		| 'auto'
		| ((ctx: ComputeDispatchContext) => [number, number, number]);
	/**
	 * Enables/disables this compute pass.
	 */
	enabled?: boolean;
}

/**
 * Compute pass class used within the render graph.
 *
 * Validates compute shader contract, parses workgroup size,
 * and resolves dispatch dimensions. Does **not** manage GPU resources
 * (that responsibility belongs to the renderer).
 */
export class ComputePass {
	/**
	 * Enables/disables this pass without removing it from graph.
	 */
	enabled: boolean;

	/**
	 * Discriminant flag for render graph to identify compute passes.
	 */
	readonly isCompute: true = true;

	private compute: string;
	private workgroupSize: [number, number, number];
	private dispatch: ComputePassOptions['dispatch'];

	constructor(options: ComputePassOptions) {
		assertComputeContract(options.compute);
		const workgroupSize = extractWorkgroupSize(options.compute);
		this.compute = options.compute;
		this.workgroupSize = workgroupSize;
		this.dispatch = options.dispatch ?? 'auto';
		this.enabled = options.enabled ?? true;
	}

	/**
	 * Replaces current compute shader and updates workgroup size.
	 *
	 * @param compute - New compute shader WGSL source.
	 * @throws {Error} When shader does not match the compute contract.
	 */
	setCompute(compute: string): void {
		assertComputeContract(compute);
		const workgroupSize = extractWorkgroupSize(compute);
		this.compute = compute;
		this.workgroupSize = workgroupSize;
	}

	/**
	 * Updates dispatch strategy.
	 */
	setDispatch(dispatch: ComputePassOptions['dispatch']): void {
		this.dispatch = dispatch ?? 'auto';
	}

	/**
	 * Returns current compute shader source.
	 */
	getCompute(): string {
		return this.compute;
	}

	/**
	 * Returns parsed workgroup size from current compute shader.
	 */
	getWorkgroupSize(): [number, number, number] {
		return [...this.workgroupSize];
	}

	/**
	 * Resolves dispatch workgroup counts for current frame.
	 *
	 * @param ctx - Dispatch context with canvas dimensions and timing.
	 * @returns Tuple [x, y, z] workgroup counts.
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
	 * Releases resources (no-op since GPU resource lifecycle is renderer-managed).
	 */
	dispose(): void {
		// No-op — GPU resources are managed by the renderer.
	}
}
