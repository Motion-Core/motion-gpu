import { describe, expect, it } from 'vitest';
import {
	normalizeDefines,
	normalizeIncludes,
	preprocessMaterialFragment,
	toDefineLine
} from '../../lib/core/material-preprocess';
import type { TypedMaterialDefineValue } from '../../lib/core/material';

describe('material preprocess', () => {
	it('normalizes typed define values and emits WGSL literals', () => {
		const defines = normalizeDefines({
			USE_COLOR: true,
			ITER: { type: 'i32', value: 2 },
			MASK: { type: 'u32', value: 3 },
			GAIN: { type: 'f32', value: 4 },
			OFFSET: { type: 'vec2f', value: [0.25, 1] },
			TINT: { type: 'vec3f', value: [1, 0.5, 0] },
			RAMP: { type: 'vec4f', value: [0, 0.25, 0.5, 1] }
		});

		expect(toDefineLine('USE_COLOR', defines.USE_COLOR!)).toBe('const USE_COLOR: bool = true;');
		expect(toDefineLine('ITER', defines.ITER!)).toBe('const ITER: i32 = 2;');
		expect(toDefineLine('MASK', defines.MASK!)).toBe('const MASK: u32 = 3u;');
		expect(toDefineLine('GAIN', defines.GAIN!)).toBe('const GAIN: f32 = 4.0;');
		expect(toDefineLine('OFFSET', defines.OFFSET!)).toBe('const OFFSET: vec2f = vec2f(0.25, 1.0);');
		expect(toDefineLine('TINT', defines.TINT!)).toBe('const TINT: vec3f = vec3f(1.0, 0.5, 0.0);');
		expect(toDefineLine('RAMP', defines.RAMP!)).toBe(
			'const RAMP: vec4f = vec4f(0.0, 0.25, 0.5, 1.0);'
		);
	});

	it('rejects malformed include and define contracts', () => {
		expect(() => normalizeIncludes({ tone: '' })).toThrow(/non-empty WGSL/);
		expect(() =>
			normalizeDefines({
				ITER: { type: 'i32', value: 1.5 }
			})
		).toThrow(/i32 define requires integer/);
		expect(() =>
			normalizeDefines({
				OFFSET: { type: 'vec2f', value: [0, 1, 2] as unknown as [number, number] }
			})
		).toThrow(/vec2f define requires a tuple with 2 finite numbers/);
		expect(() =>
			normalizeDefines({
				TINT: { type: 'vec3f', value: [0, Number.NaN, 1] }
			})
		).toThrow(/vec3f define requires a tuple with 3 finite numbers/);
		expect(() =>
			normalizeDefines({
				BAD: { type: 'vec5f', value: [0, 1, 2, 3, 4] } as unknown as TypedMaterialDefineValue
			})
		).toThrow(/Unsupported define type/);
	});

	it('expands nested includes and preserves include source mapping', () => {
		const preprocessed = preprocessMaterialFragment({
			fragment: [
				'#include <entry>',
				'fn frag(uv: vec2f) -> vec4f {',
				'\treturn shade(uv);',
				'}'
			].join('\n'),
			includes: {
				entry: [
					'#include <tone>',
					'fn shade(uv: vec2f) -> vec4f {',
					'\treturn tone(uv);',
					'}'
				].join('\n'),
				tone: ['fn tone(uv: vec2f) -> vec4f {', '\treturn vec4f(uv, 0.0, 1.0);', '}'].join('\n')
			}
		});

		expect(preprocessed.fragment).toContain('fn tone(uv: vec2f) -> vec4f');
		expect(preprocessed.fragment).toContain('fn shade(uv: vec2f) -> vec4f');
		expect(preprocessed.fragment).toContain('fn frag(uv: vec2f) -> vec4f');

		const includeLines = preprocessed.lineMap.filter((entry) => entry?.kind === 'include');
		expect(includeLines.some((entry) => entry?.include === 'entry')).toBe(true);
		expect(includeLines.some((entry) => entry?.include === 'tone')).toBe(true);
	});

	it('sorts define block deterministically in preprocessed source', () => {
		const preprocessed = preprocessMaterialFragment({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			defines: {
				ZED: false,
				ALPHA: true
			}
		});

		const [first, second] = preprocessed.fragment.split('\n');
		expect(first).toContain('const ALPHA: bool = true;');
		expect(second).toContain('const ZED: bool = false;');
		expect(preprocessed.lineMap[1]).toMatchObject({ kind: 'define', define: 'ALPHA', line: 1 });
		expect(preprocessed.lineMap[2]).toMatchObject({ kind: 'define', define: 'ZED', line: 2 });
		expect(preprocessed.defineBlockSource).toBe(
			['const ALPHA: bool = true;', 'const ZED: bool = false;'].join('\n')
		);
	});

	it('deduplicates repeated include directives in the same fragment', () => {
		const preprocessed = preprocessMaterialFragment({
			fragment: [
				'#include <noise>',
				'#include <noise>',
				'fn frag(uv: vec2f) -> vec4f {',
				'\treturn noiseColor(uv);',
				'}'
			].join('\n'),
			includes: {
				noise: ['fn noiseColor(uv: vec2f) -> vec4f {', '\treturn vec4f(uv, 0.0, 1.0);', '}'].join(
					'\n'
				)
			}
		});

		const occurrences = preprocessed.fragment.split('fn noiseColor').length - 1;
		expect(occurrences).toBe(1);
	});

	it('enforces typed define value compatibility at compile time', () => {
		const typed: TypedMaterialDefineValue = {
			type: 'vec3f',
			value: [1, 0.5, 0]
		};
		expect(typed).toEqual({ type: 'vec3f', value: [1, 0.5, 0] });

		// @ts-expect-error bool defines require boolean literals
		({ type: 'bool', value: 1 }) satisfies TypedMaterialDefineValue;
		// @ts-expect-error vec2f defines require a 2-number tuple
		({ type: 'vec2f', value: [1, 2, 3] }) satisfies TypedMaterialDefineValue;
	});
});
