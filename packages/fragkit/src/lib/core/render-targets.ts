import { assertUniformName } from './uniforms';
import type { RenderTargetDefinitionMap } from './types';

export interface ResolvedRenderTargetDefinition {
	key: string;
	width: number;
	height: number;
	format: GPUTextureFormat;
}

function assertPositiveFinite(name: string, value: number): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a finite number greater than 0`);
	}
}

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

export function buildRenderTargetSignature(
	resolvedDefinitions: ResolvedRenderTargetDefinition[]
): string {
	return resolvedDefinitions
		.map((definition) => {
			return `${definition.key}:${definition.format}:${definition.width}x${definition.height}`;
		})
		.join('|');
}
