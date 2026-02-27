import { assertUniformName } from './uniforms';
import type { RenderTargetDefinitionMap } from './types';

/**
 * Concrete render target configuration resolved for current canvas size.
 */
export interface ResolvedRenderTargetDefinition {
	/**
	 * Render target key.
	 */
	key: string;
	/**
	 * Resolved width in pixels.
	 */
	width: number;
	/**
	 * Resolved height in pixels.
	 */
	height: number;
	/**
	 * Resolved format.
	 */
	format: GPUTextureFormat;
}

/**
 * Asserts positive finite numeric input for render target options.
 */
function assertPositiveFinite(name: string, value: number): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a finite number greater than 0`);
	}
}

/**
 * Resolves a render target dimension from explicit value or scaled canvas size.
 */
function resolveDimension(
	explicitValue: number | undefined,
	canvasDimension: number,
	scale: number
): number {
	if (explicitValue !== undefined) {
		assertPositiveFinite('RenderTarget dimension', explicitValue);
		return Math.max(1, Math.floor(explicitValue));
	}

	return Math.max(1, Math.floor(canvasDimension * scale));
}

/**
 * Resolves all render target definitions for a specific canvas size.
 *
 * @param definitions - Declarative definitions.
 * @param canvasWidth - Current canvas width in pixels.
 * @param canvasHeight - Current canvas height in pixels.
 * @param defaultFormat - Fallback texture format.
 * @returns Sorted concrete render target definitions.
 */
export function resolveRenderTargetDefinitions(
	definitions: RenderTargetDefinitionMap | undefined,
	canvasWidth: number,
	canvasHeight: number,
	defaultFormat: GPUTextureFormat
): ResolvedRenderTargetDefinition[] {
	if (!definitions) {
		return [];
	}

	const keys = Object.keys(definitions).sort();
	const resolved: ResolvedRenderTargetDefinition[] = [];

	for (const key of keys) {
		assertUniformName(key);
		const definition = definitions[key];
		const scale = definition?.scale ?? 1;
		assertPositiveFinite('RenderTarget scale', scale);

		const width = resolveDimension(definition?.width, canvasWidth, scale);
		const height = resolveDimension(definition?.height, canvasHeight, scale);

		resolved.push({
			key,
			width,
			height,
			format: definition?.format ?? defaultFormat
		});
	}

	return resolved;
}

/**
 * Builds a deterministic signature used to detect render target topology changes.
 *
 * @param resolvedDefinitions - Concrete target definitions.
 * @returns Stable signature string.
 */
export function buildRenderTargetSignature(
	resolvedDefinitions: ResolvedRenderTargetDefinition[]
): string {
	return resolvedDefinitions
		.map((definition) => {
			return `${definition.key}:${definition.format}:${definition.width}x${definition.height}`;
		})
		.join('|');
}
