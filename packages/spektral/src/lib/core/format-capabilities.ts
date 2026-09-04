import { createSpektralError } from './error-report.js';

/** Storage access modes described by the WebGPU texture capability table. */
export type SpektralStorageTextureAccess = 'write-only' | 'read-only' | 'read-write';

/** Device-aware capabilities for one WebGPU texture format. */
export interface TextureFormatCapabilities {
	format: GPUTextureFormat;
	supported: boolean;
	renderable: boolean;
	colorRenderable: boolean;
	sampleType: GPUTextureSampleType | null;
	filterable: boolean;
	storageAccess: readonly SpektralStorageTextureAccess[];
	requiredFeatures: Readonly<{
		format?: GPUFeatureName;
		renderable?: GPUFeatureName;
		filterable?: GPUFeatureName;
		storageAccess?: Readonly<Partial<Record<SpektralStorageTextureAccess, GPUFeatureName>>>;
	}>;
}

export interface FormatCapabilityDiagnostic {
	target: string;
	format: unknown;
	pass: string;
	capability: string;
	detail?: string;
}

/** Texture formats recognized by the WebGPU typings supported in this release. */
export const TEXTURE_FORMATS: ReadonlySet<string> = new Set([
	'r8unorm',
	'r8snorm',
	'r8uint',
	'r8sint',
	'r16unorm',
	'r16snorm',
	'r16uint',
	'r16sint',
	'r16float',
	'rg8unorm',
	'rg8snorm',
	'rg8uint',
	'rg8sint',
	'r32uint',
	'r32sint',
	'r32float',
	'rg16unorm',
	'rg16snorm',
	'rg16uint',
	'rg16sint',
	'rg16float',
	'rgba8unorm',
	'rgba8unorm-srgb',
	'rgba8snorm',
	'rgba8uint',
	'rgba8sint',
	'bgra8unorm',
	'bgra8unorm-srgb',
	'rgb9e5ufloat',
	'rgb10a2uint',
	'rgb10a2unorm',
	'rg11b10ufloat',
	'rg32uint',
	'rg32sint',
	'rg32float',
	'rgba16unorm',
	'rgba16snorm',
	'rgba16uint',
	'rgba16sint',
	'rgba16float',
	'rgba32uint',
	'rgba32sint',
	'rgba32float',
	'stencil8',
	'depth16unorm',
	'depth24plus',
	'depth24plus-stencil8',
	'depth32float',
	'depth32float-stencil8',
	'bc1-rgba-unorm',
	'bc1-rgba-unorm-srgb',
	'bc2-rgba-unorm',
	'bc2-rgba-unorm-srgb',
	'bc3-rgba-unorm',
	'bc3-rgba-unorm-srgb',
	'bc4-r-unorm',
	'bc4-r-snorm',
	'bc5-rg-unorm',
	'bc5-rg-snorm',
	'bc6h-rgb-ufloat',
	'bc6h-rgb-float',
	'bc7-rgba-unorm',
	'bc7-rgba-unorm-srgb',
	'etc2-rgb8unorm',
	'etc2-rgb8unorm-srgb',
	'etc2-rgb8a1unorm',
	'etc2-rgb8a1unorm-srgb',
	'etc2-rgba8unorm',
	'etc2-rgba8unorm-srgb',
	'eac-r11unorm',
	'eac-r11snorm',
	'eac-rg11unorm',
	'eac-rg11snorm',
	'astc-4x4-unorm',
	'astc-4x4-unorm-srgb',
	'astc-5x4-unorm',
	'astc-5x4-unorm-srgb',
	'astc-5x5-unorm',
	'astc-5x5-unorm-srgb',
	'astc-6x5-unorm',
	'astc-6x5-unorm-srgb',
	'astc-6x6-unorm',
	'astc-6x6-unorm-srgb',
	'astc-8x5-unorm',
	'astc-8x5-unorm-srgb',
	'astc-8x6-unorm',
	'astc-8x6-unorm-srgb',
	'astc-8x8-unorm',
	'astc-8x8-unorm-srgb',
	'astc-10x5-unorm',
	'astc-10x5-unorm-srgb',
	'astc-10x6-unorm',
	'astc-10x6-unorm-srgb',
	'astc-10x8-unorm',
	'astc-10x8-unorm-srgb',
	'astc-10x10-unorm',
	'astc-10x10-unorm-srgb',
	'astc-12x10-unorm',
	'astc-12x10-unorm-srgb',
	'astc-12x12-unorm',
	'astc-12x12-unorm-srgb'
]);

const COLOR_RENDERABLE_FORMATS: ReadonlySet<GPUTextureFormat> = new Set([
	'r8unorm',
	'r8snorm',
	'r8uint',
	'r8sint',
	'r16unorm',
	'r16snorm',
	'r16uint',
	'r16sint',
	'r16float',
	'rg8unorm',
	'rg8snorm',
	'rg8uint',
	'rg8sint',
	'r32uint',
	'r32sint',
	'r32float',
	'rg16unorm',
	'rg16snorm',
	'rg16uint',
	'rg16sint',
	'rg16float',
	'rgba8unorm',
	'rgba8unorm-srgb',
	'rgba8snorm',
	'rgba8uint',
	'rgba8sint',
	'bgra8unorm',
	'bgra8unorm-srgb',
	'rgb10a2uint',
	'rgb10a2unorm',
	'rg11b10ufloat',
	'rg32uint',
	'rg32sint',
	'rg32float',
	'rgba16unorm',
	'rgba16snorm',
	'rgba16uint',
	'rgba16sint',
	'rgba16float',
	'rgba32uint',
	'rgba32sint',
	'rgba32float'
]);

const FORMAT_REQUIRED_FEATURE: Readonly<Partial<Record<GPUTextureFormat, GPUFeatureName>>> =
	Object.freeze({
		r16unorm: 'texture-formats-tier1',
		r16snorm: 'texture-formats-tier1',
		rg16unorm: 'texture-formats-tier1',
		rg16snorm: 'texture-formats-tier1',
		rgba16unorm: 'texture-formats-tier1',
		rgba16snorm: 'texture-formats-tier1',
		'bgra8unorm-srgb': 'core-features-and-limits',
		'depth32float-stencil8': 'depth32float-stencil8',
		'bc1-rgba-unorm': 'texture-compression-bc',
		'bc1-rgba-unorm-srgb': 'texture-compression-bc',
		'bc2-rgba-unorm': 'texture-compression-bc',
		'bc2-rgba-unorm-srgb': 'texture-compression-bc',
		'bc3-rgba-unorm': 'texture-compression-bc',
		'bc3-rgba-unorm-srgb': 'texture-compression-bc',
		'bc4-r-unorm': 'texture-compression-bc',
		'bc4-r-snorm': 'texture-compression-bc',
		'bc5-rg-unorm': 'texture-compression-bc',
		'bc5-rg-snorm': 'texture-compression-bc',
		'bc6h-rgb-ufloat': 'texture-compression-bc',
		'bc6h-rgb-float': 'texture-compression-bc',
		'bc7-rgba-unorm': 'texture-compression-bc',
		'bc7-rgba-unorm-srgb': 'texture-compression-bc',
		'etc2-rgb8unorm': 'texture-compression-etc2',
		'etc2-rgb8unorm-srgb': 'texture-compression-etc2',
		'etc2-rgb8a1unorm': 'texture-compression-etc2',
		'etc2-rgb8a1unorm-srgb': 'texture-compression-etc2',
		'etc2-rgba8unorm': 'texture-compression-etc2',
		'etc2-rgba8unorm-srgb': 'texture-compression-etc2',
		'eac-r11unorm': 'texture-compression-etc2',
		'eac-r11snorm': 'texture-compression-etc2',
		'eac-rg11unorm': 'texture-compression-etc2',
		'eac-rg11snorm': 'texture-compression-etc2',
		'astc-4x4-unorm': 'texture-compression-astc',
		'astc-4x4-unorm-srgb': 'texture-compression-astc',
		'astc-5x4-unorm': 'texture-compression-astc',
		'astc-5x4-unorm-srgb': 'texture-compression-astc',
		'astc-5x5-unorm': 'texture-compression-astc',
		'astc-5x5-unorm-srgb': 'texture-compression-astc',
		'astc-6x5-unorm': 'texture-compression-astc',
		'astc-6x5-unorm-srgb': 'texture-compression-astc',
		'astc-6x6-unorm': 'texture-compression-astc',
		'astc-6x6-unorm-srgb': 'texture-compression-astc',
		'astc-8x5-unorm': 'texture-compression-astc',
		'astc-8x5-unorm-srgb': 'texture-compression-astc',
		'astc-8x6-unorm': 'texture-compression-astc',
		'astc-8x6-unorm-srgb': 'texture-compression-astc',
		'astc-8x8-unorm': 'texture-compression-astc',
		'astc-8x8-unorm-srgb': 'texture-compression-astc',
		'astc-10x5-unorm': 'texture-compression-astc',
		'astc-10x5-unorm-srgb': 'texture-compression-astc',
		'astc-10x6-unorm': 'texture-compression-astc',
		'astc-10x6-unorm-srgb': 'texture-compression-astc',
		'astc-10x8-unorm': 'texture-compression-astc',
		'astc-10x8-unorm-srgb': 'texture-compression-astc',
		'astc-10x10-unorm': 'texture-compression-astc',
		'astc-10x10-unorm-srgb': 'texture-compression-astc',
		'astc-12x10-unorm': 'texture-compression-astc',
		'astc-12x10-unorm-srgb': 'texture-compression-astc',
		'astc-12x12-unorm': 'texture-compression-astc',
		'astc-12x12-unorm-srgb': 'texture-compression-astc'
	});

const RENDER_REQUIRED_FEATURE: Readonly<Partial<Record<GPUTextureFormat, GPUFeatureName>>> =
	Object.freeze({
		r8snorm: 'texture-formats-tier1',
		rg8snorm: 'texture-formats-tier1',
		rgba8snorm: 'texture-formats-tier1',
		rg11b10ufloat: 'rg11b10ufloat-renderable'
	});

const STORAGE_FORMATS: ReadonlySet<GPUTextureFormat> = new Set([
	'r8unorm',
	'r8snorm',
	'r8uint',
	'r8sint',
	'r16unorm',
	'r16snorm',
	'r16uint',
	'r16sint',
	'r16float',
	'rg8unorm',
	'rg8snorm',
	'rg8uint',
	'rg8sint',
	'rg16unorm',
	'rg16snorm',
	'rg16uint',
	'rg16sint',
	'rg16float',
	'rgba8unorm',
	'rgba8snorm',
	'rgba8uint',
	'rgba8sint',
	'rgba16unorm',
	'rgba16snorm',
	'rgba16float',
	'rgba16uint',
	'rgba16sint',
	'r32float',
	'r32sint',
	'r32uint',
	'rg32float',
	'rg32sint',
	'rg32uint',
	'rgba32float',
	'rgba32uint',
	'rgba32sint',
	'bgra8unorm',
	'rgb10a2uint',
	'rgb10a2unorm',
	'rg11b10ufloat'
]);

const EMPTY_STORAGE_ACCESS = Object.freeze([]) as readonly SpektralStorageTextureAccess[];

const STORAGE_WRITE_REQUIRED_TIER1: ReadonlySet<GPUTextureFormat> = new Set([
	'r8unorm',
	'r8snorm',
	'r8uint',
	'r8sint',
	'r16uint',
	'r16sint',
	'r16float',
	'rg8unorm',
	'rg8snorm',
	'rg8uint',
	'rg8sint',
	'rg16uint',
	'rg16sint',
	'rg16float',
	'rgb10a2uint',
	'rgb10a2unorm',
	'rg11b10ufloat'
]);

const STORAGE_WRITE_REQUIRED_CORE: ReadonlySet<GPUTextureFormat> = new Set([
	'rg32uint',
	'rg32sint',
	'rg32float'
]);

const STORAGE_READ_WRITE_FORMATS: ReadonlySet<GPUTextureFormat> = new Set([
	'r8unorm',
	'r8uint',
	'r8sint',
	'r16uint',
	'r16sint',
	'r16float',
	'rgba8unorm',
	'rgba8uint',
	'rgba8sint',
	'rgba16uint',
	'rgba16sint',
	'rgba16float',
	'r32uint',
	'r32sint',
	'r32float',
	'rgba32uint',
	'rgba32sint',
	'rgba32float'
]);

const STORAGE_READ_WRITE_BASELINE: ReadonlySet<GPUTextureFormat> = new Set([
	'r32uint',
	'r32sint',
	'r32float'
]);

function hasFeature(features: ReadonlySet<string> | undefined, feature: GPUFeatureName): boolean {
	if (features?.has(feature) === true) return true;
	if (feature === 'texture-formats-tier1' && features?.has('texture-formats-tier2')) return true;
	if (
		feature === 'rg11b10ufloat-renderable' &&
		(features?.has('texture-formats-tier1') || features?.has('texture-formats-tier2'))
	) {
		return true;
	}
	return false;
}

/** Rejects texture format strings outside the WebGPU contract known to this release. */
export function assertTextureFormat(
	format: unknown,
	label = 'Texture'
): asserts format is GPUTextureFormat {
	if (typeof format !== 'string' || !TEXTURE_FORMATS.has(format)) {
		throw new Error(`${label} format "${String(format)}" is not a recognized GPUTextureFormat.`);
	}
}

/** Reports whether a texture format uses 32-bit floating-point channels. */
export function isFloat32TextureFormat(format: GPUTextureFormat): boolean {
	return format === 'r32float' || format === 'rg32float' || format === 'rgba32float';
}

/** Reports whether the format has any storage-texture access in the WebGPU capability table. */
export function isStorageTextureFormat(format: GPUTextureFormat): boolean {
	assertTextureFormat(format);
	return STORAGE_FORMATS.has(format);
}

/** Resolves the WGSL sampled scalar represented by a texture format. */
export function textureSampleScalarType(
	format: GPUTextureFormat
): 'f32' | 'u32' | 'i32' | 'depth' | null {
	if (format === 'stencil8') return 'u32';
	if (format.startsWith('depth')) return 'depth';
	if (format.endsWith('uint')) return 'u32';
	if (format.endsWith('sint')) return 'i32';
	return 'f32';
}

/**
 * Returns the effective capabilities of a texture format on the active device.
 * This is the sole format classification table used by render, sampling and compute paths.
 */
export function resolveTextureFormatCapabilities(
	format: GPUTextureFormat,
	deviceFeatures?: ReadonlySet<string>
): TextureFormatCapabilities {
	assertTextureFormat(format);
	const scalarType = textureSampleScalarType(format);
	const formatFeature = FORMAT_REQUIRED_FEATURE[format];
	const supported = !formatFeature || hasFeature(deviceFeatures, formatFeature);
	const float32Filterable =
		isFloat32TextureFormat(format) && hasFeature(deviceFeatures, 'float32-filterable');
	const isUnfilterableNormalized16 =
		format === 'r16unorm' ||
		format === 'r16snorm' ||
		format === 'rg16unorm' ||
		format === 'rg16snorm' ||
		format === 'rgba16unorm' ||
		format === 'rgba16snorm';
	const sampleType: GPUTextureSampleType | null =
		scalarType === null
			? null
			: scalarType === 'depth'
				? 'depth'
				: scalarType === 'u32'
					? 'uint'
					: scalarType === 'i32'
						? 'sint'
						: (isFloat32TextureFormat(format) && !float32Filterable) || isUnfilterableNormalized16
							? 'unfilterable-float'
							: 'float';
	const renderFeature = RENDER_REQUIRED_FEATURE[format];
	const storageFeature =
		format === 'bgra8unorm'
			? ('bgra8unorm-storage' as GPUFeatureName)
			: STORAGE_WRITE_REQUIRED_TIER1.has(format)
				? ('texture-formats-tier1' as GPUFeatureName)
				: STORAGE_WRITE_REQUIRED_CORE.has(format)
					? ('core-features-and-limits' as GPUFeatureName)
					: undefined;
	const staticallyRenderable = COLOR_RENDERABLE_FORMATS.has(format);
	const colorRenderable =
		supported &&
		staticallyRenderable &&
		(!renderFeature || hasFeature(deviceFeatures, renderFeature));
	const renderable =
		colorRenderable || (supported && (format === 'stencil8' || format.startsWith('depth')));
	const storageWritable =
		supported &&
		STORAGE_FORMATS.has(format) &&
		(!storageFeature || hasFeature(deviceFeatures, storageFeature));
	const storageReadWriteFeature = STORAGE_READ_WRITE_BASELINE.has(format)
		? undefined
		: STORAGE_READ_WRITE_FORMATS.has(format)
			? ('texture-formats-tier2' as GPUFeatureName)
			: undefined;
	const storageReadWrite =
		storageWritable &&
		STORAGE_READ_WRITE_FORMATS.has(format) &&
		(!storageReadWriteFeature || hasFeature(deviceFeatures, storageReadWriteFeature));
	const storageAccess: SpektralStorageTextureAccess[] = [];
	if (storageWritable) {
		storageAccess.push('write-only');
		if (format !== 'bgra8unorm') storageAccess.push('read-only');
		if (storageReadWrite) storageAccess.push('read-write');
	}
	const filterable =
		supported && (sampleType === 'float' || (isFloat32TextureFormat(format) && float32Filterable));

	return {
		format,
		supported,
		renderable,
		colorRenderable,
		sampleType,
		filterable,
		storageAccess:
			storageAccess.length > 0
				? (Object.freeze(storageAccess) as readonly SpektralStorageTextureAccess[])
				: EMPTY_STORAGE_ACCESS,
		requiredFeatures: Object.freeze({
			...(formatFeature ? { format: formatFeature } : {}),
			...(renderFeature ? { renderable: renderFeature } : {}),
			...(isFloat32TextureFormat(format)
				? { filterable: 'float32-filterable' as GPUFeatureName }
				: {}),
			...(storageFeature || storageReadWriteFeature
				? {
						storageAccess: Object.freeze({
							...(storageFeature
								? {
										'write-only': storageFeature,
										...(format === 'bgra8unorm' ? {} : { 'read-only': storageFeature })
									}
								: {}),
							...(storageReadWriteFeature ? { 'read-write': storageReadWriteFeature } : {})
						})
					}
				: {})
		})
	};
}

/** Creates a stable classified error for an unmet format capability. */
export function createFormatCapabilityError(input: FormatCapabilityDiagnostic): Error {
	return createSpektralError(
		'FORMAT_CAPABILITY_MISSING',
		`${input.pass} target "${input.target}" uses format "${String(input.format)}" but is missing capability "${input.capability}".${input.detail ? ` ${input.detail}` : ''}`
	);
}

/** Validates a format used as a Spektral color render target. */
export function assertRenderableFormat(input: {
	format: unknown;
	target: string;
	pass: string;
	deviceFeatures?: ReadonlySet<string>;
}): TextureFormatCapabilities {
	try {
		assertTextureFormat(input.format);
	} catch {
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: 'recognized GPUTextureFormat'
		});
	}
	const capabilities = resolveTextureFormatCapabilities(input.format, input.deviceFeatures);
	if (!capabilities.colorRenderable) {
		const requiredFeature =
			capabilities.requiredFeatures.format ?? capabilities.requiredFeatures.renderable;
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: requiredFeature ?? 'color render attachment',
			...(requiredFeature
				? { detail: `Enable device feature "${requiredFeature}".` }
				: { detail: 'Use a color-renderable texture format.' })
		});
	}
	return capabilities;
}

/** Validates a built-in pass input declared as `texture_2d<f32>`. */
export function assertFloatSampledFormat(input: {
	format: unknown;
	target: string;
	pass: string;
	deviceFeatures?: ReadonlySet<string>;
}): TextureFormatCapabilities {
	let capabilities: TextureFormatCapabilities;
	try {
		assertTextureFormat(input.format);
		capabilities = resolveTextureFormatCapabilities(input.format, input.deviceFeatures);
	} catch {
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: 'recognized GPUTextureFormat'
		});
	}
	if (!capabilities.supported) {
		const requiredFeature = capabilities.requiredFeatures.format!;
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: requiredFeature,
			detail: `Enable device feature "${requiredFeature}".`
		});
	}
	if (capabilities.sampleType !== 'float' && capabilities.sampleType !== 'unfilterable-float') {
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: 'float texture sampling',
			detail:
				'This built-in pass declares texture_2d<f32>; use a float-sampled format or a custom typed pass.'
		});
	}
	return capabilities;
}

/** Validates a built-in pass output written by a `vec4f` fragment result. */
export function assertFloatRenderableFormat(input: {
	format: unknown;
	target: string;
	pass: string;
	deviceFeatures?: ReadonlySet<string>;
}): TextureFormatCapabilities {
	const capabilities = assertRenderableFormat(input);
	if (capabilities.sampleType !== 'float' && capabilities.sampleType !== 'unfilterable-float') {
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: 'float color render attachment',
			detail:
				'This built-in pass writes vec4f; use a float/unorm/snorm format or a custom typed pass.'
		});
	}
	return capabilities;
}

/** Validates a storage texture access against the active device. */
export function assertStorageTextureAccess(input: {
	format: unknown;
	target: string;
	pass: string;
	access: SpektralStorageTextureAccess;
	deviceFeatures?: ReadonlySet<string>;
}): TextureFormatCapabilities {
	let capabilities: TextureFormatCapabilities;
	try {
		assertTextureFormat(input.format);
		capabilities = resolveTextureFormatCapabilities(input.format, input.deviceFeatures);
	} catch {
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: 'recognized GPUTextureFormat'
		});
	}
	if (!capabilities.storageAccess.includes(input.access)) {
		const requiredFeature =
			capabilities.requiredFeatures.format ??
			capabilities.requiredFeatures.storageAccess?.[input.access];
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: requiredFeature ?? `storage texture ${input.access}`,
			...(requiredFeature
				? { detail: `Enable device feature "${requiredFeature}".` }
				: { detail: `The format does not support ${input.access} storage access.` })
		});
	}
	return capabilities;
}

/** Validates that a device supports the format itself, independent of a specific usage. */
export function assertTextureFormatSupported(input: {
	format: unknown;
	target: string;
	pass: string;
	deviceFeatures?: ReadonlySet<string>;
}): TextureFormatCapabilities {
	let capabilities: TextureFormatCapabilities;
	try {
		assertTextureFormat(input.format);
		capabilities = resolveTextureFormatCapabilities(input.format, input.deviceFeatures);
	} catch {
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: 'recognized GPUTextureFormat'
		});
	}
	if (!capabilities.supported) {
		const requiredFeature = capabilities.requiredFeatures.format!;
		throw createFormatCapabilityError({
			target: input.target,
			format: input.format,
			pass: input.pass,
			capability: requiredFeature,
			detail: `Enable device feature "${requiredFeature}".`
		});
	}
	return capabilities;
}
