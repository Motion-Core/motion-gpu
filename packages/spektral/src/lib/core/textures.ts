import {
	assertTextureFormat,
	resolveTextureFormatCapabilities,
	textureSampleScalarType
} from './format-capabilities.js';
import { assertUniformName } from './uniforms.js';
import type {
	TextureData,
	TextureDefinition,
	TextureDefinitionMap,
	TextureUpdateMode,
	TextureValue
} from './types.js';

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
	/**
	 * Whether this texture is a storage texture (writable by compute).
	 */
	storage: boolean;
	/**
	 * Whether this texture should be exposed as a fragment-stage sampled binding.
	 */
	fragmentVisible: boolean;
	/**
	 * Explicit width for storage textures. Undefined when derived from source.
	 */
	width?: number;
	/**
	 * Explicit height for storage textures. Undefined when derived from source.
	 */
	height?: number;
}

export interface TextureSamplingLayout {
	sampleType: GPUTextureSampleType;
	samplerType: GPUSamplerBindingType;
	effectiveFilter: GPUFilterMode;
	filterWasCoerced: boolean;
}

/**
 * Default sampling filter for textures when no explicit value is provided.
 */
const DEFAULT_TEXTURE_FILTER: GPUFilterMode = 'linear';

/**
 * Default addressing mode for textures when no explicit value is provided.
 */
const DEFAULT_TEXTURE_ADDRESS_MODE: GPUAddressMode = 'clamp-to-edge';
const TEXTURE_COLOR_SPACES = new Set(['srgb', 'linear']);
const TEXTURE_UPDATE_MODES = new Set(['once', 'onInvalidate', 'perFrame']);
const TEXTURE_FILTER_MODES = new Set(['nearest', 'linear']);
const TEXTURE_ADDRESS_MODES = new Set(['clamp-to-edge', 'repeat', 'mirror-repeat']);

/**
 * Validates an optional boolean texture field without applying a default.
 */
function assertOptionalBoolean(name: string, value: unknown): void {
	if (value !== undefined && typeof value !== 'boolean') {
		throw new Error(`${name} must be a boolean, got ${String(value)}.`);
	}
}

/**
 * Validates a required runtime enum value against its WebGPU allowlist.
 */
function assertEnumValue(name: string, value: unknown, allowed: ReadonlySet<string>): void {
	if (typeof value !== 'string' || !allowed.has(value)) {
		throw new Error(
			`${name} must be one of ${Array.from(allowed).join(', ')}, got ${String(value)}.`
		);
	}
}

/**
 * Validates an optional runtime enum value when the caller supplied one.
 */
function assertOptionalEnumValue(name: string, value: unknown, allowed: ReadonlySet<string>): void {
	if (value !== undefined) {
		assertEnumValue(name, value, allowed);
	}
}

/**
 * Validates one concrete texture dimension before size calculations.
 */
function assertTextureDimension(name: string, value: number): void {
	if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a finite positive integer, got ${String(value)}.`);
	}
}

export { assertTextureFormat } from './format-capabilities.js';

/**
 * Validates concrete 2D texture dimensions before mip calculation or GPU allocation.
 */
export function assertTextureDimensions(width: number, height: number, label = 'Texture'): void {
	assertTextureDimension(`${label} width`, width);
	assertTextureDimension(`${label} height`, height);
}

/**
 * Validates dimensions against the active device's 2D texture limit.
 */
export function assertTextureDimensionsWithinLimit(
	width: number,
	height: number,
	maxTextureDimension2D: number,
	label = 'Texture'
): void {
	assertTextureDimensions(width, height, label);
	assertTextureDimension('device.limits.maxTextureDimension2D', maxTextureDimension2D);
	if (width > maxTextureDimension2D || height > maxTextureDimension2D) {
		throw new Error(
			`${label} dimensions ${width}x${height} exceed device.limits.maxTextureDimension2D (${maxTextureDimension2D}).`
		);
	}
}

/**
 * Resolves binding sample types and coerces unsupported filters to nearest sampling.
 */
export function resolveTextureSamplingLayout(input: {
	format: GPUTextureFormat;
	filter: GPUFilterMode;
	deviceFeatures?: GPUSupportedFeatures;
}): TextureSamplingLayout {
	const capabilities = resolveTextureFormatCapabilities(input.format, input.deviceFeatures);
	if (capabilities.sampleType === 'uint') {
		return {
			sampleType: 'uint',
			samplerType: 'non-filtering',
			effectiveFilter: 'nearest',
			filterWasCoerced: input.filter !== 'nearest'
		};
	}

	if (capabilities.sampleType === 'sint') {
		return {
			sampleType: 'sint',
			samplerType: 'non-filtering',
			effectiveFilter: 'nearest',
			filterWasCoerced: input.filter !== 'nearest'
		};
	}

	if (capabilities.sampleType === 'depth') {
		return {
			sampleType: 'depth',
			samplerType: 'non-filtering',
			effectiveFilter: 'nearest',
			filterWasCoerced: input.filter !== 'nearest'
		};
	}

	if (capabilities.sampleType === 'unfilterable-float') {
		return {
			sampleType: 'unfilterable-float',
			samplerType: 'non-filtering',
			effectiveFilter: 'nearest',
			filterWasCoerced: input.filter !== 'nearest'
		};
	}

	return {
		sampleType: 'float',
		samplerType: input.filter === 'linear' ? 'filtering' : 'non-filtering',
		effectiveFilter: input.filter,
		filterWasCoerced: false
	};
}

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
	assertOptionalEnumValue('Texture colorSpace', definition?.colorSpace, TEXTURE_COLOR_SPACES);
	assertOptionalEnumValue('Texture update', definition?.update, TEXTURE_UPDATE_MODES);
	if (definition?.format !== undefined) {
		assertTextureFormat(definition.format);
	}
	assertOptionalEnumValue('Texture filter', definition?.filter, TEXTURE_FILTER_MODES);
	assertOptionalEnumValue('Texture addressModeU', definition?.addressModeU, TEXTURE_ADDRESS_MODES);
	assertOptionalEnumValue('Texture addressModeV', definition?.addressModeV, TEXTURE_ADDRESS_MODES);
	assertOptionalBoolean('Texture flipY', definition?.flipY);
	assertOptionalBoolean('Texture generateMipmaps', definition?.generateMipmaps);
	assertOptionalBoolean('Texture premultipliedAlpha', definition?.premultipliedAlpha);
	assertOptionalBoolean('Texture storage', definition?.storage);
	assertOptionalBoolean('Texture fragmentVisible', definition?.fragmentVisible);
	if (definition?.width !== undefined) {
		assertTextureDimension('Texture width', definition.width);
	}
	if (definition?.height !== undefined) {
		assertTextureDimension('Texture height', definition.height);
	}
	const anisotropy = definition?.anisotropy ?? 1;
	if (typeof anisotropy !== 'number' || !Number.isFinite(anisotropy)) {
		throw new Error(`Texture anisotropy must be a finite number, got ${String(anisotropy)}.`);
	}

	const isStorage = definition?.storage === true;
	const defaultFormat = definition?.colorSpace === 'linear' ? 'rgba8unorm' : 'rgba8unorm-srgb';
	const format = definition?.format ?? defaultFormat;
	const sampleScalar = textureSampleScalarType(format);
	const explicitFragmentVisible = definition?.fragmentVisible;

	if (explicitFragmentVisible === true && sampleScalar !== 'f32') {
		throw new Error(
			`Texture with storage format "${format}" cannot be fragmentVisible: ` +
				`fragment shader uses texture_2d<f32>, which is incompatible with ${sampleScalar} sample type. ` +
				`Set fragmentVisible: false or use a float-sampled storage format.`
		);
	}

	const fragmentVisible = explicitFragmentVisible ?? sampleScalar === 'f32';
	const normalized: NormalizedTextureDefinition = {
		source: definition?.source ?? null,
		colorSpace: definition?.colorSpace ?? 'srgb',
		format,
		flipY: definition?.flipY ?? true,
		generateMipmaps: definition?.generateMipmaps ?? false,
		premultipliedAlpha: definition?.premultipliedAlpha ?? false,
		anisotropy: Math.max(1, Math.min(16, Math.floor(anisotropy))),
		filter: definition?.filter ?? DEFAULT_TEXTURE_FILTER,
		addressModeU: definition?.addressModeU ?? DEFAULT_TEXTURE_ADDRESS_MODE,
		addressModeV: definition?.addressModeV ?? DEFAULT_TEXTURE_ADDRESS_MODE,
		storage: isStorage,
		fragmentVisible
	};

	if (definition?.width !== undefined) {
		normalized.width = definition.width;
	}
	if (definition?.height !== undefined) {
		normalized.height = definition.height;
	}

	if (definition?.update !== undefined) {
		normalized.update = definition.update;
	}

	return normalized;
}

/**
 * Normalizes all texture definitions for already-resolved texture keys.
 *
 * @param textures - Source texture definitions.
 * @param textureKeys - Texture keys to normalize.
 * @returns Normalized map keyed by `textureKeys`.
 */
export function normalizeTextureDefinitions(
	textures: Readonly<TextureDefinitionMap>,
	textureKeys: readonly string[]
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
	if (input.override !== undefined) {
		assertEnumValue('Texture update override', input.override, TEXTURE_UPDATE_MODES);
		return input.override;
	}

	if (input.defaultMode !== undefined) {
		assertEnumValue('Texture default update mode', input.defaultMode, TEXTURE_UPDATE_MODES);
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
export function resolveTextureSize(data: TextureData): {
	width: number;
	height: number;
} {
	assertOptionalEnumValue('Texture colorSpace', data.colorSpace, TEXTURE_COLOR_SPACES);
	assertOptionalEnumValue('Texture update', data.update, TEXTURE_UPDATE_MODES);
	assertOptionalBoolean('Texture flipY', data.flipY);
	assertOptionalBoolean('Texture generateMipmaps', data.generateMipmaps);
	assertOptionalBoolean('Texture premultipliedAlpha', data.premultipliedAlpha);

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

	assertTextureDimensions(width, height, 'Texture source');

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
	assertTextureDimensions(width, height);
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
