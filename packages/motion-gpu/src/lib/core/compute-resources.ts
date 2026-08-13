import type {
	ComputeBufferReference,
	ComputeResourceDescriptor,
	ComputeResourceMap,
	ComputeSamplerReference,
	ComputeTextureReference,
	ComputeTextureViewDescriptor
} from './types.js';
import { assertUniformName } from './uniforms.js';

const RESERVED_COMPUTE_RESOURCE_ALIASES = new Set(['motiongpuFrame', 'motiongpuUniforms']);

const TEXTURE_DESCRIPTOR_KEYS = new Set(['texture', 'access', 'view', 'version', 'pingPong']);
const BUFFER_DESCRIPTOR_KEYS = new Set(['buffer', 'access', 'version']);
const SAMPLER_DESCRIPTOR_KEYS = new Set(['sampler']);
const EXTERNAL_TEXTURE_KEYS = new Set([
	'externalTexture',
	'resourceId',
	'format',
	'usage',
	'viewDimension'
]);
const EXTERNAL_TEXTURE_VIEW_KEYS = new Set([
	'externalView',
	'resourceId',
	'format',
	'usage',
	'viewDimension',
	'mipLevelCount'
]);
const EXTERNAL_BUFFER_KEYS = new Set(['externalBuffer', 'resourceId', 'wgslType', 'size', 'usage']);
const EXTERNAL_SAMPLER_KEYS = new Set(['externalSampler', 'resourceId', 'type']);
const TEXTURE_VIEW_KEYS = new Set([
	'baseMipLevel',
	'mipLevelCount',
	'baseArrayLayer',
	'arrayLayerCount'
]);

interface ComputeResourceIdentity {
	kind: 'material' | 'external';
	value: string | symbol;
}

export interface ComputePingPongResourcePair {
	readAlias: string;
	writeAlias: string;
	texture: ComputeTextureReference;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoUnknownKeys(
	label: string,
	value: Record<string, unknown>,
	allowedKeys: ReadonlySet<string>
): void {
	const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
	if (unknownKey !== undefined) {
		throw new Error(`${label} contains unsupported field "${unknownKey}".`);
	}
}

function assertResourceId(label: string, value: unknown): asserts value is string | symbol {
	if ((typeof value !== 'string' || value.length === 0) && typeof value !== 'symbol') {
		throw new Error(`${label} resourceId must be a non-empty string or symbol.`);
	}
}

function assertExternalProvider(label: string, value: unknown): void {
	if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
		throw new Error(`${label} must provide a WebGPU object or provider function.`);
	}
}

function assertUsage(label: string, value: unknown): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		throw new Error(`${label} usage must be a non-negative integer bitmask.`);
	}
}

function assertPositiveInteger(label: string, value: unknown): asserts value is number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error(`${label} must be a positive integer.`);
	}
}

function assertTextureViewDescriptor(
	alias: string,
	view: unknown
): asserts view is ComputeTextureViewDescriptor {
	if (!isObjectRecord(view)) {
		throw new Error(`Compute resource "${alias}" view must be an object.`);
	}

	assertNoUnknownKeys(`Compute resource "${alias}" view`, view, TEXTURE_VIEW_KEYS);
	for (const key of ['baseMipLevel', 'baseArrayLayer'] as const) {
		const value = view[key];
		if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) {
			throw new Error(`Compute resource "${alias}" view.${key} must be a non-negative integer.`);
		}
	}
	if (view.mipLevelCount !== undefined) {
		assertPositiveInteger(`Compute resource "${alias}" view.mipLevelCount`, view.mipLevelCount);
	}
	if (view.arrayLayerCount !== undefined && view.arrayLayerCount !== 1) {
		throw new Error(`Compute resource "${alias}" view.arrayLayerCount must be 1.`);
	}
}

function assertExternalTextureReference(alias: string, reference: Record<string, unknown>): void {
	assertNoUnknownKeys(
		`Compute resource "${alias}" external texture`,
		reference,
		EXTERNAL_TEXTURE_KEYS
	);
	assertExternalProvider(`Compute resource "${alias}" externalTexture`, reference.externalTexture);
	assertResourceId(`Compute resource "${alias}"`, reference.resourceId);
	if (typeof reference.format !== 'string' || reference.format.length === 0) {
		throw new Error(`Compute resource "${alias}" format must be a non-empty string.`);
	}
	assertUsage(`Compute resource "${alias}"`, reference.usage);
	if (reference.viewDimension !== undefined && reference.viewDimension !== '2d') {
		throw new Error(`Compute resource "${alias}" viewDimension must be "2d".`);
	}
}

function assertExternalTextureViewReference(
	alias: string,
	reference: Record<string, unknown>
): void {
	assertNoUnknownKeys(
		`Compute resource "${alias}" external texture view`,
		reference,
		EXTERNAL_TEXTURE_VIEW_KEYS
	);
	assertExternalProvider(`Compute resource "${alias}" externalView`, reference.externalView);
	assertResourceId(`Compute resource "${alias}"`, reference.resourceId);
	if (typeof reference.format !== 'string' || reference.format.length === 0) {
		throw new Error(`Compute resource "${alias}" format must be a non-empty string.`);
	}
	assertUsage(`Compute resource "${alias}"`, reference.usage);
	if (reference.viewDimension !== '2d') {
		throw new Error(`Compute resource "${alias}" viewDimension must be "2d".`);
	}
	assertPositiveInteger(`Compute resource "${alias}" mipLevelCount`, reference.mipLevelCount);
}

function assertTextureReference(
	alias: string,
	reference: unknown
): asserts reference is ComputeTextureReference {
	if (typeof reference === 'string') {
		if (reference.length === 0) {
			throw new Error(`Compute resource "${alias}" texture key must not be empty.`);
		}
		return;
	}
	if (!isObjectRecord(reference)) {
		throw new Error(
			`Compute resource "${alias}" texture must be a material key or external reference.`
		);
	}

	const hasTexture = 'externalTexture' in reference;
	const hasView = 'externalView' in reference;
	if (hasTexture === hasView) {
		throw new Error(
			`Compute resource "${alias}" texture reference must provide exactly one of externalTexture or externalView.`
		);
	}
	if (hasTexture) {
		assertExternalTextureReference(alias, reference);
		return;
	}
	assertExternalTextureViewReference(alias, reference);
}

function assertBufferReference(
	alias: string,
	reference: unknown
): asserts reference is ComputeBufferReference {
	if (typeof reference === 'string') {
		if (reference.length === 0) {
			throw new Error(`Compute resource "${alias}" buffer key must not be empty.`);
		}
		return;
	}
	if (!isObjectRecord(reference)) {
		throw new Error(
			`Compute resource "${alias}" buffer must be a material key or external reference.`
		);
	}

	assertNoUnknownKeys(
		`Compute resource "${alias}" external buffer`,
		reference,
		EXTERNAL_BUFFER_KEYS
	);
	assertExternalProvider(`Compute resource "${alias}" externalBuffer`, reference.externalBuffer);
	assertResourceId(`Compute resource "${alias}"`, reference.resourceId);
	if (typeof reference.wgslType !== 'string' || reference.wgslType.length === 0) {
		throw new Error(`Compute resource "${alias}" wgslType must be a non-empty string.`);
	}
	assertPositiveInteger(`Compute resource "${alias}" size`, reference.size);
	assertUsage(`Compute resource "${alias}"`, reference.usage);
}

function assertSamplerReference(
	alias: string,
	reference: unknown
): asserts reference is ComputeSamplerReference {
	if (typeof reference === 'string') {
		if (reference.length === 0) {
			throw new Error(`Compute resource "${alias}" sampler key must not be empty.`);
		}
		return;
	}
	if (!isObjectRecord(reference)) {
		throw new Error(
			`Compute resource "${alias}" sampler must be a material key or external reference.`
		);
	}

	assertNoUnknownKeys(
		`Compute resource "${alias}" external sampler`,
		reference,
		EXTERNAL_SAMPLER_KEYS
	);
	assertExternalProvider(`Compute resource "${alias}" externalSampler`, reference.externalSampler);
	assertResourceId(`Compute resource "${alias}"`, reference.resourceId);
	if (
		reference.type !== 'filtering' &&
		reference.type !== 'non-filtering' &&
		reference.type !== 'comparison'
	) {
		throw new Error(`Compute resource "${alias}" sampler type is invalid.`);
	}
}

function assertComputeResourceDescriptor(
	alias: string,
	descriptor: unknown
): asserts descriptor is ComputeResourceDescriptor {
	if (!isObjectRecord(descriptor)) {
		throw new Error(`Compute resource "${alias}" descriptor must be an object.`);
	}

	const discriminants = ['texture', 'buffer', 'sampler'].filter((key) => key in descriptor);
	if (discriminants.length !== 1) {
		throw new Error(
			`Compute resource "${alias}" must provide exactly one of texture, buffer, or sampler.`
		);
	}

	if ('texture' in descriptor) {
		assertNoUnknownKeys(`Compute resource "${alias}"`, descriptor, TEXTURE_DESCRIPTOR_KEYS);
		assertTextureReference(alias, descriptor.texture);
		if (descriptor.access !== 'sampled' && descriptor.access !== 'storage-write') {
			throw new Error(
				`Compute resource "${alias}" texture access must be "sampled" or "storage-write".`
			);
		}
		if (descriptor.view !== undefined) {
			assertTextureViewDescriptor(alias, descriptor.view);
		}
		if (descriptor.access === 'sampled') {
			if (
				descriptor.version !== undefined &&
				descriptor.version !== 'current' &&
				descriptor.version !== 'initial'
			) {
				throw new Error(`Compute resource "${alias}" version must be "current" or "initial".`);
			}
			if (descriptor.pingPong !== undefined && descriptor.pingPong !== 'read') {
				throw new Error(`Compute resource "${alias}" sampled pingPong role must be "read".`);
			}
			return;
		}
		if ('version' in descriptor) {
			throw new Error(`Compute resource "${alias}" storage-write descriptor cannot set version.`);
		}
		if (descriptor.pingPong !== undefined && descriptor.pingPong !== 'write') {
			throw new Error(`Compute resource "${alias}" storage-write pingPong role must be "write".`);
		}
		return;
	}

	if ('buffer' in descriptor) {
		assertNoUnknownKeys(`Compute resource "${alias}"`, descriptor, BUFFER_DESCRIPTOR_KEYS);
		assertBufferReference(alias, descriptor.buffer);
		if (descriptor.access !== 'storage-read' && descriptor.access !== 'storage-read-write') {
			throw new Error(
				`Compute resource "${alias}" buffer access must be "storage-read" or "storage-read-write".`
			);
		}
		if (descriptor.access === 'storage-read') {
			if (
				descriptor.version !== undefined &&
				descriptor.version !== 'current' &&
				descriptor.version !== 'initial'
			) {
				throw new Error(`Compute resource "${alias}" version must be "current" or "initial".`);
			}
			return;
		}
		if ('version' in descriptor) {
			throw new Error(
				`Compute resource "${alias}" storage-read-write descriptor cannot set version.`
			);
		}
		return;
	}

	assertNoUnknownKeys(`Compute resource "${alias}"`, descriptor, SAMPLER_DESCRIPTOR_KEYS);
	assertSamplerReference(alias, descriptor.sampler);
}

function cloneTextureReference(reference: ComputeTextureReference): ComputeTextureReference {
	return typeof reference === 'string' ? reference : { ...reference };
}

function cloneBufferReference(reference: ComputeBufferReference): ComputeBufferReference {
	return typeof reference === 'string' ? reference : { ...reference };
}

function cloneSamplerReference(reference: ComputeSamplerReference): ComputeSamplerReference {
	return typeof reference === 'string' ? reference : { ...reference };
}

function cloneComputeResourceDescriptor(
	descriptor: ComputeResourceDescriptor
): ComputeResourceDescriptor {
	if ('texture' in descriptor) {
		return {
			...descriptor,
			texture: cloneTextureReference(descriptor.texture),
			...(descriptor.view !== undefined ? { view: { ...descriptor.view } } : {})
		};
	}
	if ('buffer' in descriptor) {
		return { ...descriptor, buffer: cloneBufferReference(descriptor.buffer) };
	}
	return { ...descriptor, sampler: cloneSamplerReference(descriptor.sampler) };
}

function freezeComputeResourceDescriptor(
	descriptor: ComputeResourceDescriptor
): ComputeResourceDescriptor {
	if ('texture' in descriptor) {
		if (typeof descriptor.texture !== 'string') {
			Object.freeze(descriptor.texture);
		}
		if (descriptor.view !== undefined) {
			Object.freeze(descriptor.view);
		}
	} else if ('buffer' in descriptor) {
		if (typeof descriptor.buffer !== 'string') {
			Object.freeze(descriptor.buffer);
		}
	} else if (typeof descriptor.sampler !== 'string') {
		Object.freeze(descriptor.sampler);
	}
	return Object.freeze(descriptor);
}

/**
 * Validates, clones and freezes a deterministic compute resource topology.
 */
export function normalizeComputeResourceMap(
	resources: ComputeResourceMap | undefined
): ComputeResourceMap {
	if (resources === undefined) {
		return Object.freeze({});
	}
	if (!isObjectRecord(resources)) {
		throw new Error('Compute resources must be an object map keyed by WGSL aliases.');
	}

	const normalized: Record<string, ComputeResourceDescriptor> = Object.create(null) as Record<
		string,
		ComputeResourceDescriptor
	>;
	for (const alias of Object.keys(resources).sort()) {
		assertUniformName(alias);
		if (RESERVED_COMPUTE_RESOURCE_ALIASES.has(alias)) {
			throw new Error(`Compute resource alias "${alias}" is reserved by MotionGPU.`);
		}
		const descriptor = resources[alias];
		assertComputeResourceDescriptor(alias, descriptor);
		normalized[alias] = freezeComputeResourceDescriptor(cloneComputeResourceDescriptor(descriptor));
	}
	return Object.freeze(normalized);
}

/**
 * Returns a deep-enough defensive copy while preserving external GPU handles/providers.
 */
export function copyComputeResourceMap(resources: ComputeResourceMap): ComputeResourceMap {
	const copy: Record<string, ComputeResourceDescriptor> = Object.create(null) as Record<
		string,
		ComputeResourceDescriptor
	>;
	for (const alias of Object.keys(resources)) {
		const descriptor = resources[alias];
		if (descriptor !== undefined) {
			copy[alias] = cloneComputeResourceDescriptor(descriptor);
		}
	}
	return copy;
}

function textureResourceIdentity(reference: ComputeTextureReference): ComputeResourceIdentity {
	return typeof reference === 'string'
		? { kind: 'material', value: reference }
		: { kind: 'external', value: reference.resourceId };
}

function sameResourceIdentity(a: ComputeResourceIdentity, b: ComputeResourceIdentity): boolean {
	return a.kind === b.kind && Object.is(a.value, b.value);
}

/**
 * Validates and resolves the single read/write pair required by ping-pong compute.
 */
export function resolveComputePingPongResourcePair(
	resources: ComputeResourceMap
): ComputePingPongResourcePair {
	const reads: Array<[string, Extract<ComputeResourceDescriptor, { texture: unknown }>]> = [];
	const writes: Array<[string, Extract<ComputeResourceDescriptor, { texture: unknown }>]> = [];
	for (const [alias, descriptor] of Object.entries(resources)) {
		if (!('texture' in descriptor)) {
			continue;
		}
		if (descriptor.pingPong === 'read') {
			reads.push([alias, descriptor]);
		} else if (descriptor.pingPong === 'write') {
			writes.push([alias, descriptor]);
		}
	}

	if (reads.length !== 1 || writes.length !== 1) {
		throw new Error(
			'PingPongComputePass resources must contain exactly one pingPong read texture and one pingPong write texture.'
		);
	}

	const read = reads[0];
	const write = writes[0];
	if (read === undefined || write === undefined) {
		throw new Error('PingPongComputePass resource pair resolution failed.');
	}
	const [readAlias, readDescriptor] = read;
	const [writeAlias, writeDescriptor] = write;
	if (readDescriptor.access !== 'sampled' || writeDescriptor.access !== 'storage-write') {
		throw new Error(
			'PingPongComputePass read resource must be sampled and write resource must be storage-write.'
		);
	}
	if (
		!sameResourceIdentity(
			textureResourceIdentity(readDescriptor.texture),
			textureResourceIdentity(writeDescriptor.texture)
		)
	) {
		throw new Error(
			'PingPongComputePass read and write resources must reference the same texture.'
		);
	}

	return { readAlias, writeAlias, texture: readDescriptor.texture };
}
