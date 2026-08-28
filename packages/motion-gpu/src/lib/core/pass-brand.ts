/** Internal nominal marker shared by MotionGPU-managed pass classes. */
export const managedPassBrand: unique symbol = Symbol('MotionGPU managed pass');

export type ManagedPassKind = 'compute' | 'feedback';
