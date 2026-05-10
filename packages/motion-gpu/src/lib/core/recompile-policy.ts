import type { ColorPipelineOptions } from './types.js';

/**
 * Inputs that affect renderer pipeline compilation.
 */
export interface RendererPipelineSignatureInput {
	/**
	 * Material pipeline signature (fragment preprocess + uniform/texture layout).
	 */
	materialSignature: string;
	/**
	 * Color pipeline and HDR presentation options.
	 */
	color?: ColorPipelineOptions;
}

/**
 * Returns deterministic renderer pipeline signature.
 *
 * Rebuild triggers:
 * - material signature changes (shader/layout related)
 * - color pipeline, output encoding, or HDR presentation options change
 *
 * Non-triggers:
 * - runtime uniform values
 * - runtime texture sources
 * - clear color changes
 */
export function buildRendererPipelineSignature(input: RendererPipelineSignatureInput): string {
	return `${input.materialSignature}|${JSON.stringify(input.color ?? {})}`;
}
