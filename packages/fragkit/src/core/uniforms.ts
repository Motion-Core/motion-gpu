import type { UniformMap, UniformValue } from './types';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertUniformName(name: string): void {
	if (!IDENTIFIER_PATTERN.test(name)) {
		throw new Error(`Invalid uniform name: ${name}`);
	}
}

export function toVec4(value: UniformValue): [number, number, number, number] {
	if (typeof value === 'number') {
		return [value, 0, 0, 0];
	}

	if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
		throw new Error('Uniform value must be number, vec2, vec3 or vec4');
	}

	const out: [number, number, number, number] = [0, 0, 0, 0];
	for (let i = 0; i < value.length; i += 1) {
		out[i] = value[i] ?? 0;
	}

	return out;
}

export function resolveUniformKeys(uniforms: UniformMap): string[] {
	const keys = Object.keys(uniforms).sort();
	for (const key of keys) {
		assertUniformName(key);
	}
	return keys;
}

export function packUniforms(uniforms: UniformMap, uniformKeys: string[]): Float32Array {
	const data = new Float32Array(Math.max(4, uniformKeys.length * 4));

	for (let index = 0; index < uniformKeys.length; index += 1) {
		const key = uniformKeys[index];
		const packed = toVec4(uniforms[key] ?? 0);
		const offset = index * 4;
		data[offset] = packed[0];
		data[offset + 1] = packed[1];
		data[offset + 2] = packed[2];
		data[offset + 3] = packed[3];
	}

	return data;
}
