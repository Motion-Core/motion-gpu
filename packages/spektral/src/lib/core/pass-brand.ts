/** Internal nominal marker shared by Spektral-managed pass classes. */
export const managedPassBrand: unique symbol = Symbol('Spektral managed pass');

export type ManagedPassKind = 'compute' | 'feedback';

/** Internal nominal marker for built-in render passes with a known WGSL format contract. */
export const builtInRenderPassBrand: unique symbol = Symbol('Spektral built-in render pass');

export interface BuiltInRenderPassFormatContract {
	readonly passName: string;
	readonly input: 'float-sampled';
	readonly output: 'float-renderable';
}
