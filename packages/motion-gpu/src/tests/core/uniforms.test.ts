import { describe, expect, it } from 'vitest';
import {
	assertUniformValueForType,
	inferUniformType,
	packUniformsInto,
	packUniforms,
	resolveUniformLayout
} from '../../lib/core/uniforms';

describe('uniform helpers', () => {
	it('infers uniform types from scalar, tuple and typed values', () => {
		expect(inferUniformType(4)).toBe('f32');
		expect(inferUniformType([1, 2])).toBe('vec2f');
		expect(inferUniformType([1, 2, 3])).toBe('vec3f');
		expect(inferUniformType([1, 2, 3, 4])).toBe('vec4f');
		expect(inferUniformType({ type: 'mat4x4f', value: new Float32Array(16) })).toBe('mat4x4f');
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
			assertUniformValueForType('mat4x4f', { type: 'mat4x4f', value: [1, 2, 3] })
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
});
