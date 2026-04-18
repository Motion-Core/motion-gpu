import { describe, expect, it } from 'vitest';
import {
	assertUniformValueForType,
	inferUniformType,
	packUniformsInto,
	packUniforms,
	resolveUniformLayout
} from '../../lib/core/uniforms';
import type { TypedUniform, UniformValue } from '../../lib/core/types';

describe('uniform helpers', () => {
	it('infers uniform types from scalar, tuple and typed values', () => {
		expect(inferUniformType(4)).toBe('f32');
		expect(inferUniformType([1, 2])).toBe('vec2f');
		expect(inferUniformType([1, 2, 3])).toBe('vec3f');
		expect(inferUniformType([1, 2, 3, 4])).toBe('vec4f');
		expect(inferUniformType({ type: 'mat4x4f', value: new Float32Array(16) })).toBe('mat4x4f');
		expect(() => inferUniformType([1, 2, 3, 4, 5] as unknown as UniformValue)).toThrow(
			/Uniform value must resolve/
		);
	});

	it('builds layout using wgsl alignment rules', () => {
		const layout = resolveUniformLayout({
			a: { type: 'f32', value: 1 },
			b: { type: 'vec2f', value: [1, 2] },
			c: { type: 'vec3f', value: [1, 2, 3] },
			d: { type: 'mat4x4f', value: new Float32Array(16) }
		});

		expect(layout.byName.a?.offset).toBe(0);
		expect(layout.byName.b?.offset).toBe(8);
		expect(layout.byName.c?.offset).toBe(16);
		expect(layout.byName.d?.offset).toBe(32);
		expect(layout.byteLength).toBe(96);
	});

	it('validates values against declared uniform types', () => {
		expect(() => assertUniformValueForType('f32', 1)).not.toThrow();
		expect(() => assertUniformValueForType('vec2f', [1, 2])).not.toThrow();
		expect(() =>
			assertUniformValueForType('mat4x4f', {
				type: 'mat4x4f',
				value: [1, 2, 3]
			})
		).toThrow(/16 numbers/);
		expect(() => assertUniformValueForType('vec3f', [1, 2])).toThrow(/vec3f/);
	});

	it('packs typed uniforms with offsets and matrices', () => {
		const matrix = new Float32Array(16);
		matrix[0] = 1;
		matrix[5] = 1;
		matrix[10] = 1;
		matrix[15] = 1;
		const layout = resolveUniformLayout({
			uIntensity: { type: 'f32', value: 0 },
			uTint: { type: 'vec3f', value: [0, 0, 0] },
			uTransform: { type: 'mat4x4f', value: matrix }
		});

		const packed = packUniforms(
			{
				uIntensity: { type: 'f32', value: 0.5 },
				uTint: { type: 'vec3f', value: [1, 0.5, 0.2] },
				uTransform: { type: 'mat4x4f', value: matrix }
			},
			layout
		);

		expect(packed[0]).toBeCloseTo(0.5);
		expect(packed[4]).toBeCloseTo(1);
		expect(packed[5]).toBeCloseTo(0.5);
		expect(packed[6]).toBeCloseTo(0.2);
		expect(packed[8]).toBeCloseTo(1);
		expect(packed[13]).toBeCloseTo(1);
		expect(packed[18]).toBeCloseTo(1);
		expect(packed[23]).toBeCloseTo(1);
	});

	it('packs uniforms into provided output buffer and clears stale values', () => {
		const layout = resolveUniformLayout({
			uA: { type: 'f32', value: 0 },
			uB: { type: 'vec2f', value: [0, 0] }
		});
		const output = new Float32Array(layout.byteLength / 4).fill(9);

		packUniformsInto(
			{
				uA: { type: 'f32', value: 2 },
				uB: { type: 'vec2f', value: [3, 4] }
			},
			layout,
			output
		);
		expect(output[0]).toBeCloseTo(2);
		expect(output[2]).toBeCloseTo(3);
		expect(output[3]).toBeCloseTo(4);

		packUniformsInto(
			{
				uA: { type: 'f32', value: 5 }
			},
			layout,
			output
		);
		expect(output[0]).toBeCloseTo(5);
		expect(output[2]).toBeCloseTo(0);
		expect(output[3]).toBeCloseTo(0);
	});

	it('throws when output buffer size does not match layout', () => {
		const layout = resolveUniformLayout({ uA: 1 });
		const wrongSize = new Float32Array(1 + layout.byteLength / 4);
		expect(() => packUniformsInto({ uA: 1 }, layout, wrongSize)).toThrow(/size mismatch/);
	});

	it('rejects invalid identifier names and non-finite typed values', () => {
		expect(() =>
			resolveUniformLayout({
				'bad-name': 1
			})
		).toThrow(/Invalid uniform name/);

		expect(() =>
			assertUniformValueForType('f32', {
				type: 'f32',
				value: Number.NaN
			})
		).toThrow(/finite number/);
	});

	it('enforces typed uniform value compatibility at compile time', () => {
		const typed: TypedUniform<'vec2f'> = {
			type: 'vec2f',
			value: [1, 2]
		};
		expect(typed.value).toEqual([1, 2]);

		// @ts-expect-error vec2f uniforms require a 2-number tuple
		({ type: 'vec2f', value: 1 }) satisfies TypedUniform<'vec2f'>;
	});

	it('rejects vec4f with wrong-length tuple', () => {
		expect(() => assertUniformValueForType('vec4f', [1, 2, 3])).toThrow(/vec4f/);
		expect(() =>
			assertUniformValueForType('vec4f', [1, 2, 3, 4, 5] as unknown as [
				number,
				number,
				number,
				number
			])
		).toThrow(/vec4f/);
	});

	it('rejects NaN and Infinity inside vec tuples', () => {
		expect(() => assertUniformValueForType('vec2f', [1, Number.NaN])).toThrow(/vec2f/);
		expect(() => assertUniformValueForType('vec3f', [1, 2, Number.POSITIVE_INFINITY])).toThrow(
			/vec3f/
		);
		expect(() => assertUniformValueForType('vec4f', [1, Number.NaN, 3, 4])).toThrow(/vec4f/);
	});

	it('rejects Float32Array of wrong length for mat4x4f', () => {
		expect(() =>
			assertUniformValueForType('mat4x4f', { type: 'mat4x4f', value: new Float32Array(15) })
		).toThrow(/16 numbers/);
		expect(() =>
			assertUniformValueForType('mat4x4f', { type: 'mat4x4f', value: new Float32Array(17) })
		).toThrow(/16 numbers/);
	});

	it('resolves empty uniform map to minimum 16-byte layout', () => {
		const layout = resolveUniformLayout({});
		expect(layout.entries).toEqual([]);
		expect(layout.byteLength).toBe(16);
	});

	it('packs mat4x4f from plain number array', () => {
		const matrix = Array.from({ length: 16 }, (_, i) =>
			i === 0 || i === 5 || i === 10 || i === 15 ? 1 : 0
		);
		const layout = resolveUniformLayout({
			uMatrix: { type: 'mat4x4f', value: new Float32Array(16) }
		});

		const packed = packUniforms({ uMatrix: { type: 'mat4x4f', value: matrix } }, layout);

		expect(packed[0]).toBeCloseTo(1);
		expect(packed[5]).toBeCloseTo(1);
		expect(packed[10]).toBeCloseTo(1);
		expect(packed[15]).toBeCloseTo(1);
		expect(packed[1]).toBeCloseTo(0);
	});

	it('rejects non-number non-array non-typed values in inferUniformType', () => {
		expect(() => inferUniformType('hello' as unknown as UniformValue)).toThrow(
			/Uniform value must resolve/
		);
		expect(() => inferUniformType({} as unknown as UniformValue)).toThrow(
			/Uniform value must resolve/
		);
		expect(() => inferUniformType(null as unknown as UniformValue)).toThrow(
			/Uniform value must resolve/
		);
	});

	it('packs mat4x4f from Float32Array with correct column-major values', () => {
		// Identity matrix in column-major order
		const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
		const layout = resolveUniformLayout({
			uMatrix: { type: 'mat4x4f', value: identity }
		});
		const packed = packUniforms({ uMatrix: { type: 'mat4x4f', value: identity } }, layout);

		// All 16 values must match exactly — Float32Array.set() path
		for (let i = 0; i < 16; i += 1) {
			expect(packed[i]).toBe(identity[i]);
		}
	});

	it('packs Float32Array mat4x4f with arbitrary non-identity values', () => {
		const matrix = new Float32Array(16);
		for (let i = 0; i < 16; i += 1) {
			matrix[i] = (i + 1) * 0.1;
		}
		const layout = resolveUniformLayout({
			uM: { type: 'mat4x4f', value: matrix }
		});
		const packed = packUniforms({ uM: { type: 'mat4x4f', value: matrix } }, layout);

		for (let i = 0; i < 16; i += 1) {
			expect(packed[i]).toBeCloseTo(matrix[i]!, 5);
		}
	});

	it('packs multiple uniforms including Float32Array mat4x4f at non-zero offset', () => {
		const matrix = new Float32Array(16);
		for (let i = 0; i < 16; i += 1) {
			matrix[i] = i + 10;
		}
		const layout = resolveUniformLayout({
			uScale: 2.5,
			uMatrix: { type: 'mat4x4f', value: matrix }
		});
		const packed = packUniforms(
			{
				uScale: 2.5,
				uMatrix: { type: 'mat4x4f', value: matrix }
			},
			layout
		);

		const matrixBaseFloat = layout.byName['uMatrix']!.offset / 4;
		for (let i = 0; i < 16; i += 1) {
			expect(packed[matrixBaseFloat + i]).toBeCloseTo(matrix[i]!, 5);
		}
	});
});
