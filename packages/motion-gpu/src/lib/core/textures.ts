import { assertUniformName } from './uniforms';
import type {
	TextureData,
	TextureDefinition,
	TextureDefinitionMap,
	TextureUpdateMode,
	TextureValue
} from './types';

/**
 * Texture definition with defaults and normalized numeric limits applied.
 */
export interface NormalizedTextureDefinition {
	/**
	 * Normalized source value.
	 */
	source: TextureValue;
	/**
	 * Effective color space.
	 */
	colorSpace: 'srgb' | 'linear';
	/**
	 * Effective texture format.
	 */
	format: GPUTextureFormat;
	/**
	 * Effective flip-y flag.
	 */
	flipY: boolean;
	/**
	 * Effective mipmap toggle.
	 */
	generateMipmaps: boolean;
	/**
	 * Effective premultiplied-alpha flag.
	 */
	premultipliedAlpha: boolean;
	/**
	 * Effective dynamic update strategy.
	 */
	update?: TextureUpdateMode;
	/**
	 * Effective anisotropy level.
	 */
	anisotropy: number;
	/**
	 * Effective filter mode.
	 */
	filter: GPUFilterMode;
	/**
	 * Effective U address mode.
	 */
	addressModeU: GPUAddressMode;
	/**
	 * Effective V address mode.
	 */
	addressModeV: GPUAddressMode;
}

/**
 * Default sampling filter for textures when no explicit value is provided.
 */
const DEFAULT_TEXTURE_FILTER: GPUFilterMode = 'linear';

/**
 * Default addressing mode for textures when no explicit value is provided.
 */
const DEFAULT_TEXTURE_ADDRESS_MODE: GPUAddressMode = 'clamp-to-edge';

/**
 * Validates and returns sorted texture keys.
 *
 * @param textures - Texture definition map.
 * @returns Lexicographically sorted texture keys.
 */
export function resolveTextureKeys(textures: TextureDefinitionMap): string[] {
	const keys = Object.keys(textures).sort();
	for (const key of keys) {
		assertUniformName(key);
	}
	return keys;
}

/**
 * Applies defaults and clamps to a single texture definition.
 *
 * @param definition - Optional texture definition.
 * @returns Normalized definition with deterministic defaults.
 */
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
		update: definition?.update,
		anisotropy: Math.max(1, Math.min(16, Math.floor(definition?.anisotropy ?? 1))),
		filter: definition?.filter ?? DEFAULT_TEXTURE_FILTER,
		addressModeU: definition?.addressModeU ?? DEFAULT_TEXTURE_ADDRESS_MODE,
		addressModeV: definition?.addressModeV ?? DEFAULT_TEXTURE_ADDRESS_MODE
	};
}

/**
 * Normalizes all texture definitions for already-resolved texture keys.
 *
 * @param textures - Source texture definitions.
 * @param textureKeys - Texture keys to normalize.
 * @returns Normalized map keyed by `textureKeys`.
 */
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

/**
 * Checks whether a texture value is a structured `{ source, width?, height? }` object.
 */
export function isTextureData(value: TextureValue): value is TextureData {
	return typeof value === 'object' && value !== null && 'source' in value;
}

/**
 * Converts supported texture input variants to normalized `TextureData`.
 *
 * @param value - Texture value input.
 * @returns Structured texture data or `null`.
 */
export function toTextureData(value: TextureValue): TextureData | null {
	if (value === null) {
		return null;
	}

	if (isTextureData(value)) {
		return value;
	}

	return { source: value };
}

/**
 * Resolves effective runtime texture update strategy.
 */
export function resolveTextureUpdateMode(input: {
	source: TextureData['source'];
	override?: TextureUpdateMode;
	defaultMode?: TextureUpdateMode;
}): TextureUpdateMode {
	if (input.override) {
		return input.override;
	}

	if (input.defaultMode) {
		return input.defaultMode;
	}

	if (isVideoTextureSource(input.source)) {
		return 'perFrame';
	}

	return 'once';
}

/**
 * Resolves texture dimensions from explicit values or source metadata.
 *
 * @param data - Texture payload.
 * @returns Positive integer width/height.
 * @throws {Error} When dimensions cannot be resolved to positive values.
 */
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

/**
 * Computes the number of mipmap levels for a base texture size.
 *
 * @param width - Base width.
 * @param height - Base height.
 * @returns Total mip level count (minimum `1`).
 */
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

/**
 * Checks whether the source is an `HTMLVideoElement`.
 */
export function isVideoTextureSource(source: TextureData['source']): source is HTMLVideoElement {
	return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
}
