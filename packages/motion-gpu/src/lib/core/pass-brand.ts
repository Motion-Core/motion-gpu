/** Internal nominal marker shared by MotionGPU-managed pass classes. */
export const managedPassBrand: unique symbol = Symbol('MotionGPU managed pass');

export type ManagedPassKind = 'compute' | 'feedback';

/** Internal nominal marker for built-in render passes with a known WGSL format contract. */
export const builtInRenderPassBrand: unique symbol = Symbol('MotionGPU built-in render pass');

export interface BuiltInRenderPassFormatContract {
	readonly passName: string;
	readonly input: 'float-sampled';
	readonly output: 'float-renderable';
}
