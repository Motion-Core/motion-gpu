import { assertUniformName } from './uniforms';
import type { TextureData, TextureDefinition, TextureDefinitionMap, TextureValue } from './types';

export interface NormalizedTextureDefinition {
	source: TextureValue;
	colorSpace: 'srgb' | 'linear';
	format: GPUTextureFormat;
	flipY: boolean;
	generateMipmaps: boolean;
	premultipliedAlpha: boolean;
	anisotropy: number;
	filter: GPUFilterMode;
	addressModeU: GPUAddressMode;
	addressModeV: GPUAddressMode;
}

const DEFAULT_TEXTURE_FILTER: GPUFilterMode = 'linear';
const DEFAULT_TEXTURE_ADDRESS_MODE: GPUAddressMode = 'clamp-to-edge';

export function resolveTextureKeys(textures: TextureDefinitionMap): string[] {
	const keys = Object.keys(textures).sort();
	for (const key of keys) {
		assertUniformName(key);
	}
	return keys;
}

export function normalizeTextureDefinition(
	definition: TextureDefinition | undefined
): NormalizedTextureDefinition {
	return {
		source: definition?.source ?? null,
		colorSpace: definition?.colorSpace ?? 'srgb',
		format: definition?.colorSpace === 'linear' ? 'rgba8unorm' : 'rgba8unorm-srgb',
		flipY: definition?.flipY ?? true,
		generateMipmaps: definition?.generateMipmaps ?? false,
		premultipliedAlpha: definition?.premultipliedAlpha ?? false,
		anisotropy: Math.max(1, Math.min(16, Math.floor(definition?.anisotropy ?? 1))),
		filter: definition?.filter ?? DEFAULT_TEXTURE_FILTER,
		addressModeU: definition?.addressModeU ?? DEFAULT_TEXTURE_ADDRESS_MODE,
		addressModeV: definition?.addressModeV ?? DEFAULT_TEXTURE_ADDRESS_MODE
	};
}

export function normalizeTextureDefinitions(
	textures: TextureDefinitionMap,
	textureKeys: string[]
): Record<string, NormalizedTextureDefinition> {
	const out: Record<string, NormalizedTextureDefinition> = {};
	for (const key of textureKeys) {
		out[key] = normalizeTextureDefinition(textures[key]);
	}
	return out;
}

export function isTextureData(value: TextureValue): value is TextureData {
	return typeof value === 'object' && value !== null && 'source' in value;
}

export function toTextureData(value: TextureValue): TextureData | null {
	if (value === null) {
		return null;
	}

	if (isTextureData(value)) {
		return value;
	}

	return { source: value };
}

export function resolveTextureSize(data: TextureData): { width: number; height: number } {
	const source = data.source as {
		width?: number;
		height?: number;
		naturalWidth?: number;
		naturalHeight?: number;
		videoWidth?: number;
		videoHeight?: number;
	};

	const width = data.width ?? source.naturalWidth ?? source.videoWidth ?? source.width ?? 0;
	const height = data.height ?? source.naturalHeight ?? source.videoHeight ?? source.height ?? 0;

	if (width <= 0 || height <= 0) {
		throw new Error('Texture source must have positive width and height');
	}

	return { width, height };
}

export function getTextureMipLevelCount(width: number, height: number): number {
	let levels = 1;
	let currentWidth = Math.max(1, width);
	let currentHeight = Math.max(1, height);

	while (currentWidth > 1 || currentHeight > 1) {
		currentWidth = Math.max(1, Math.floor(currentWidth / 2));
		currentHeight = Math.max(1, Math.floor(currentHeight / 2));
		levels += 1;
	}

	return levels;
}

export function isVideoTextureSource(source: TextureData['source']): source is HTMLVideoElement {
	return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
}
