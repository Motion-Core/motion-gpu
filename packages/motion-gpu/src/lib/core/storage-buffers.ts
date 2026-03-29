import { assertUniformName } from './uniforms.js';
import type {
	StorageBufferDefinition,
	StorageBufferDefinitionMap,
	StorageBufferType
} from './types.js';

/**
 * Valid WGSL storage buffer element types.
 */
const VALID_STORAGE_BUFFER_TYPES: ReadonlySet<string> = new Set<StorageBufferType>([
	'array<f32>',
	'array<vec2f>',
	'array<vec3f>',
	'array<vec4f>',
	'array<u32>',
	'array<i32>',
	'array<vec4u>',
	'array<vec4i>'
]);

/**
 * Storage-compatible texture formats for `texture_storage_2d`.
 */
export const STORAGE_TEXTURE_FORMATS: ReadonlySet<GPUTextureFormat> = new Set([
	'r32float',
	'r32sint',
	'r32uint',
	'rg32float',
	'rg32sint',
	'rg32uint',
	'rgba8unorm',
	'rgba8snorm',
	'rgba8uint',
	'rgba8sint',
	'rgba16float',
	'rgba16uint',
	'rgba16sint',
	'rgba32float',
	'rgba32uint',
	'rgba32sint',
	'bgra8unorm'
] as GPUTextureFormat[]);

/**
 * Validates a single storage buffer definition.
 *
 * @param name - Buffer identifier.
 * @param definition - Storage buffer definition to validate.
 * @throws {Error} When any field is invalid.
 */
export function assertStorageBufferDefinition(
	name: string,
	definition: StorageBufferDefinition
): void {
	assertUniformName(name);

	if (!Number.isFinite(definition.size) || definition.size <= 0) {
		throw new Error(
			`Storage buffer "${name}" size must be a finite number greater than 0, got ${definition.size}`
		);
	}

	if (definition.size % 4 !== 0) {
		throw new Error(
			`Storage buffer "${name}" size must be a multiple of 4, got ${definition.size}`
		);
	}

	if (!VALID_STORAGE_BUFFER_TYPES.has(definition.type)) {
		throw new Error(
			`Storage buffer "${name}" has unknown type "${definition.type}". Supported types: ${[...VALID_STORAGE_BUFFER_TYPES].join(', ')}`
		);
	}

	if (
		definition.access !== undefined &&
		definition.access !== 'read' &&
		definition.access !== 'read-write'
	) {
		throw new Error(
			`Storage buffer "${name}" has invalid access mode "${definition.access}". Use 'read' or 'read-write'.`
		);
	}

	if (definition.initialData !== undefined) {
		if (definition.initialData.byteLength > definition.size) {
			throw new Error(
				`Storage buffer "${name}" initialData byte length (${definition.initialData.byteLength}) exceeds buffer size (${definition.size})`
			);
		}
	}
}

/**
 * Validates and returns sorted storage buffer keys.
 *
 * @param definitions - Storage buffer definition map.
 * @returns Lexicographically sorted buffer keys.
 */
export function resolveStorageBufferKeys(definitions: StorageBufferDefinitionMap): string[] {
	const keys = Object.keys(definitions).sort();
	for (const key of keys) {
		const definition = definitions[key];
		if (definition) {
			assertStorageBufferDefinition(key, definition);
		}
	}
	return keys;
}

/**
 * Normalizes a storage buffer definition with defaults applied.
 *
 * @param definition - Raw definition.
 * @returns Normalized definition with access default.
 */
export function normalizeStorageBufferDefinition(
	definition: StorageBufferDefinition
): Required<Pick<StorageBufferDefinition, 'size' | 'type' | 'access'>> {
	return {
		size: definition.size,
		type: definition.type,
		access: definition.access ?? 'read-write'
	};
}

/**
 * Validates that a texture format is storage-compatible.
 *
 * @param name - Texture identifier.
 * @param format - GPU texture format.
 * @throws {Error} When format is not storage-compatible.
 */
export function assertStorageTextureFormat(name: string, format: GPUTextureFormat): void {
	if (!STORAGE_TEXTURE_FORMATS.has(format)) {
		throw new Error(
			`Texture "${name}" with storage:true requires a storage-compatible format, but got "${format}". ` +
				`Supported formats: ${[...STORAGE_TEXTURE_FORMATS].join(', ')}`
		);
	}
}
