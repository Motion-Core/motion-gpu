import { describe, expect, it } from 'vitest';
import { packUniforms, resolveUniformKeys, toVec4 } from './uniforms';

describe('uniform helpers', () => {
	it('packs scalar and vectors to vec4', () => {
		expect(toVec4(4)).toEqual([4, 0, 0, 0]);
		expect(toVec4([1, 2])).toEqual([1, 2, 0, 0]);
		expect(toVec4([1, 2, 3])).toEqual([1, 2, 3, 0]);
		expect(toVec4([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
	});

	it('sorts uniform keys and validates identifiers', () => {
		expect(resolveUniformKeys({ z: 0, a: 1 })).toEqual(['a', 'z']);
		expect(() => resolveUniformKeys({ 'bad-key': 1 })).toThrow(/Invalid uniform name/);
	});

	it('writes all uniforms to a tightly packed float array', () => {
		const packed = packUniforms(
			{
				intensity: 0.5,
				tint: [1, 0.5, 0.2]
			},
			['intensity', 'tint']
		);

		expect(packed[0]).toBeCloseTo(0.5);
		expect(packed[1]).toBe(0);
		expect(packed[2]).toBe(0);
		expect(packed[3]).toBe(0);
		expect(packed[4]).toBeCloseTo(1);
		expect(packed[5]).toBeCloseTo(0.5);
		expect(packed[6]).toBeCloseTo(0.2);
		expect(packed[7]).toBe(0);
	});
});
