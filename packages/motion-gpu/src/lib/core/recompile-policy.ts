import type { OutputColorSpace } from './types';

/**
 * Inputs that affect renderer pipeline compilation.
 */
export interface RendererPipelineSignatureInput {
	/**
	 * Material pipeline signature (fragment preprocess + uniform/texture layout).
	 */
	materialSignature: string;
	/**
	 * Output color-space transform mode.
	 */
	outputColorSpace: OutputColorSpace;
}

/**
 * Returns deterministic renderer pipeline signature.
 *
 * Rebuild triggers:
 * - material signature changes (shader/layout related)
 * - output color space changes
 *
 * Non-triggers:
 * - runtime uniform values
 * - runtime texture sources
 * - clear color changes
 */
export function buildRendererPipelineSignature(input: RendererPipelineSignatureInput): string {
	return `${input.materialSignature}|${input.outputColorSpace}`;
}
