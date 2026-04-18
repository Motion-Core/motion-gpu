import type {
	UniformLayout,
	UniformLayoutEntry,
	UniformMap,
	UniformMat4Value,
	UniformType,
	UniformValue
} from './types.js';

/**
 * Internal representation of explicitly typed uniform input.
 */
type UniformTypedInput = Extract<UniformValue, { type: UniformType; value: unknown }>;

/**
 * Valid WGSL identifier pattern used for uniform and texture keys.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Rounds a value up to the nearest multiple of `alignment`.
 */
function roundUp(value: number, alignment: number): number {
	return Math.ceil(value / alignment) * alignment;
}

/**
 * Returns WGSL std140-like alignment and size metadata for a uniform type.
 */
function getTypeLayout(type: UniformType): { alignment: number; size: number } {
	switch (type) {
		case 'f32':
			return { alignment: 4, size: 4 };
		case 'vec2f':
			return { alignment: 8, size: 8 };
		case 'vec3f':
			return { alignment: 16, size: 12 };
		case 'vec4f':
			return { alignment: 16, size: 16 };
		case 'mat4x4f':
			return { alignment: 16, size: 64 };
		default:
			throw new Error(`Unsupported uniform type: ${type satisfies never}`);
	}
}

/**
 * Type guard for explicitly typed uniform objects.
 */
function isTypedUniformValue(value: UniformValue): value is UniformTypedInput {
	return typeof value === 'object' && value !== null && 'type' in value && 'value' in value;
}

/**
 * Validates numeric tuple input with a fixed length.
 */
function isTuple(value: unknown, size: number): value is number[] {
	return (
		Array.isArray(value) &&
		value.length === size &&
		value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
	);
}

/**
 * Type guard for accepted 4x4 matrix uniform values.
 */
function isMat4Value(value: unknown): value is UniformMat4Value {
	if (value instanceof Float32Array) {
		return value.length === 16;
	}

	return (
		Array.isArray(value) &&
		value.length === 16 &&
		value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
	);
}

/**
 * Asserts that a name can be safely used as a WGSL identifier.
 *
 * @param name - Candidate uniform/texture name.
 * @throws {Error} When the identifier is invalid.
 */
export function assertUniformName(name: string): void {
	if (!IDENTIFIER_PATTERN.test(name)) {
		throw new Error(`Invalid uniform name: ${name}`);
	}
}

/**
 * Infers the WGSL type tag from a runtime uniform value.
 *
 * @param value - Uniform input value.
 * @returns Inferred uniform type.
 * @throws {Error} When the value does not match any supported shape.
 */
export function inferUniformType(value: UniformValue): UniformType {
	if (isTypedUniformValue(value)) {
		return value.type;
	}

	if (typeof value === 'number') {
		return 'f32';
	}

	if (Array.isArray(value)) {
		if (value.length === 2) {
			return 'vec2f';
		}
		if (value.length === 3) {
			return 'vec3f';
		}
		if (value.length === 4) {
			return 'vec4f';
		}
	}

	throw new Error('Uniform value must resolve to f32, vec2f, vec3f, vec4f or mat4x4f');
}

/**
 * Validates that a uniform value matches an explicit uniform type declaration.
 *
 * @param type - Declared WGSL type.
 * @param value - Runtime value to validate.
 * @throws {Error} When the value shape is incompatible with the declared type.
 */
export function assertUniformValueForType(type: UniformType, value: UniformValue): void {
	const input = isTypedUniformValue(value) ? value.value : value;

	if (type === 'f32') {
		if (typeof input !== 'number' || !Number.isFinite(input)) {
			throw new Error('Uniform f32 value must be a finite number');
		}
		return;
	}

	if (type === 'vec2f') {
		if (!isTuple(input, 2)) {
			throw new Error('Uniform vec2f value must be a tuple with 2 numbers');
		}
		return;
	}

	if (type === 'vec3f') {
		if (!isTuple(input, 3)) {
			throw new Error('Uniform vec3f value must be a tuple with 3 numbers');
		}
		return;
	}

	if (type === 'vec4f') {
		if (!isTuple(input, 4)) {
			throw new Error('Uniform vec4f value must be a tuple with 4 numbers');
		}
		return;
	}

	if (!isMat4Value(input)) {
		throw new Error('Uniform mat4x4f value must contain 16 numbers');
	}
}

/**
 * Resolves a deterministic packed uniform buffer layout from a uniform map.
 *
 * @param uniforms - Input uniform definitions.
 * @returns Sorted layout with byte offsets and final buffer byte length.
 */
export function resolveUniformLayout(uniforms: UniformMap): UniformLayout {
	const names = Object.keys(uniforms).sort();
	let offset = 0;
	const entries: UniformLayoutEntry[] = [];
	const byName: Record<string, UniformLayoutEntry> = {};

	for (const name of names) {
		assertUniformName(name);
		const type = inferUniformType(uniforms[name] as UniformValue);
		const { alignment, size } = getTypeLayout(type);
		offset = roundUp(offset, alignment);

		const entry: UniformLayoutEntry = {
			name,
			type,
			offset,
			size
		};

		entries.push(entry);
		byName[name] = entry;
		offset += size;
	}

	const byteLength = Math.max(16, roundUp(offset, 16));
	return { entries, byName, byteLength };
}

/**
 * Writes one uniform value into the output float buffer without re-validating.
 *
 * Callers are responsible for ensuring the value has already been validated
 * against `type` (e.g. via {@link assertUniformValueForType}).
 *
 * Uses `Float32Array.set()` for mat4x4f values backed by a Float32Array,
 * which is significantly faster than an element-by-element loop.
 */
function writeUniformValueFast(
	type: UniformType,
	value: UniformValue,
	data: Float32Array,
	base: number
): void {
	const input = isTypedUniformValue(value) ? value.value : value;

	if (type === 'f32') {
		data[base] = input as number;
		return;
	}

	if (type === 'mat4x4f') {
		const matrix = input as UniformMat4Value;
		if (matrix instanceof Float32Array) {
			// Single native copy — faster than a 16-iteration element loop.
			data.set(matrix, base);
			return;
		}

		const arr = matrix as number[];
		for (let index = 0; index < 16; index += 1) {
			data[base + index] = arr[index] ?? 0;
		}
		return;
	}

	const tuple = input as number[];
	const length = type === 'vec2f' ? 2 : type === 'vec3f' ? 3 : 4;
	for (let index = 0; index < length; index += 1) {
		data[base + index] = tuple[index] ?? 0;
	}
}

/**
 * Packs uniforms into a newly allocated `Float32Array`.
 *
 * @param uniforms - Uniform values to pack.
 * @param layout - Target layout definition.
 * @returns Packed float buffer sized to `layout.byteLength`.
 */
export function packUniforms(uniforms: UniformMap, layout: UniformLayout): Float32Array {
	const data = new Float32Array(layout.byteLength / 4);
	packUniformsInto(uniforms, layout, data);
	return data;
}

/**
 * Packs uniforms into an existing output buffer and zeroes missing values.
 *
 * Values are validated against their declared types before being written.
 * Uses an optimised fast-write path internally to avoid redundant type checks
 * after validation has already been performed for each entry.
 *
 * @param uniforms - Uniform values to pack.
 * @param layout - Target layout metadata.
 * @param data - Destination float buffer.
 * @throws {Error} When `data` size does not match the required layout size.
 */
export function packUniformsInto(
	uniforms: UniformMap,
	layout: UniformLayout,
	data: Float32Array
): void {
	const requiredLength = layout.byteLength / 4;
	if (data.length !== requiredLength) {
		throw new Error(
			`Uniform output buffer size mismatch. Expected ${requiredLength}, got ${data.length}`
		);
	}

	data.fill(0);
	for (const entry of layout.entries) {
		const raw = uniforms[entry.name];
		if (raw === undefined) {
			continue;
		}

		// Validate once per entry, then write via the fast (non-validating) path.
		assertUniformValueForType(entry.type, raw);
		const base = entry.offset / 4;
		writeUniformValueFast(entry.type, raw, data, base);
	}
}

/**
 * Packs uniforms into an existing output buffer without per-entry validation.
 *
 * Intended for the renderer render loop where all values have already been
 * validated at {@link setUniform} call time, making per-write re-validation
 * redundant. Skips the size guard and validation to minimise hot-path overhead.
 *
 * @internal
 * @param uniforms - Pre-validated uniform values to pack.
 * @param layout - Target layout metadata.
 * @param data - Destination float buffer (must match `layout.byteLength / 4`).
 */
export function packUniformsIntoFast(
	uniforms: UniformMap,
	layout: UniformLayout,
	data: Float32Array
): void {
	data.fill(0);
	for (const entry of layout.entries) {
		const raw = uniforms[entry.name];
		if (raw === undefined) {
			continue;
		}

		writeUniformValueFast(entry.type, raw, data, entry.offset / 4);
	}
}
