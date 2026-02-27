import { describe, expect, it } from 'vitest';
import {
	applyMaterialDefines,
	buildDefinesBlock,
	defineMaterial,
	resolveMaterial
} from '../../lib/core/material';

describe('material', () => {
	it('creates immutable material snapshots with normalized defaults', () => {
		const input = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: { uMix: 0.5 },
			defines: { USE_MIX: true }
		});

		expect(input.uniforms).toEqual({ uMix: 0.5 });
		expect(input.textures).toEqual({});
		expect(input.defines).toEqual({ USE_MIX: true });
		expect(Object.isFrozen(input)).toBe(true);
		expect(Object.isFrozen(input.uniforms)).toBe(true);
		expect(Object.isFrozen(input.textures)).toBe(true);
		expect(Object.isFrozen(input.defines)).toBe(true);
	});

	it('builds and applies define blocks', () => {
		const block = buildDefinesBlock({
			USE_FOG: true,
			INTENSITY: 2,
			ITERATIONS: { type: 'i32', value: 4 }
		});

		expect(block).toContain('const USE_FOG: bool = true;');
		expect(block).toContain('const INTENSITY: f32 = 2.0;');
		expect(block).toContain('const ITERATIONS: i32 = 4;');

		const withDefines = applyMaterialDefines(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			{ USE_FOG: false }
		);

		expect(withDefines).toContain('const USE_FOG: bool = false;');
		expect(withDefines).toContain('fn frag(uv: vec2f) -> vec4f');
	});

	it('resolves material and tracks signature', () => {
		const resolved = resolveMaterial(
			defineMaterial({
				fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				uniforms: { b: 1, a: 0 },
				textures: { z: {}, x: {} }
			})
		);

		expect(resolved.uniformLayout.entries.map((entry) => entry.name)).toEqual(['a', 'b']);
		expect(resolved.textureKeys).toEqual(['x', 'z']);
		expect(resolved.signature).toContain('"uniforms":["a:f32","b:f32"]');
	});

	it('changes signature when defines change', () => {
		const baseFragment = 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }';
		const a = resolveMaterial(
			defineMaterial({
				fragment: baseFragment,
				defines: { USE_GRAIN: true }
			})
		);
		const b = resolveMaterial(
			defineMaterial({
				fragment: baseFragment,
				defines: { USE_GRAIN: false }
			})
		);

		expect(a.signature).not.toEqual(b.signature);
	});

	it('changes signature when texture sampler config changes', () => {
		const baseFragment = 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }';
		const a = resolveMaterial(
			defineMaterial({
				fragment: baseFragment,
				textures: {
					uMain: { filter: 'linear', addressModeU: 'clamp-to-edge' }
				}
			})
		);
		const b = resolveMaterial(
			defineMaterial({
				fragment: baseFragment,
				textures: {
					uMain: { filter: 'nearest', addressModeU: 'repeat' }
				}
			})
		);

		expect(a.signature).not.toEqual(b.signature);
	});

	it('rejects invalid fragment contracts and define values', () => {
		expect(() =>
			defineMaterial({
				fragment: 'fn nope() -> vec4f { return vec4f(0.0); }'
			})
		).toThrow(/fn frag\(uv: vec2f\) -> vec4f/);

		expect(() =>
			defineMaterial({
				fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				defines: { BROKEN: Number.NaN }
			})
		).toThrow(/Define numbers must be finite/);

		expect(() =>
			defineMaterial({
				fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				defines: { BROKEN: { type: 'u32', value: -1 } }
			})
		).toThrow(/u32 define must be >= 0/);
	});

	it('expands includes and preserves source mapping metadata', () => {
		const resolved = resolveMaterial(
			defineMaterial({
				fragment: `
#include <colorize>
fn frag(uv: vec2f) -> vec4f {
	return colorize(uv);
}
`,
				includes: {
					colorize: `
fn colorize(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.0, 1.0);
}
`
				}
			})
		);

		expect(resolved.fragmentWgsl).toContain('fn colorize(uv: vec2f) -> vec4f');
		expect(resolved.fragmentWgsl).toContain('fn frag(uv: vec2f) -> vec4f');
		const includeLine = resolved.fragmentLineMap.find((entry) => entry?.kind === 'include');
		expect(includeLine).toMatchObject({
			kind: 'include',
			include: 'colorize'
		});
	});

	it('rejects unknown or circular include references', () => {
		expect(() =>
			defineMaterial({
				fragment: '#include <missing>\nfn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
			})
		).toThrow(/Unknown include "missing"/);

		expect(() =>
			defineMaterial({
				fragment: '#include <a>\nfn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				includes: {
					a: '#include <b>',
					b: '#include <a>'
				}
			})
		).toThrow(/Circular include detected/);
	});

	it('reuses resolved material snapshot for immutable material instances', () => {
		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: { uMix: 0.25 }
		});

		const first = resolveMaterial(material);
		const second = resolveMaterial(material);
		expect(first).toBe(second);
	});

	it('throws when resolving non-normalized material objects', () => {
		const rawMaterial = {
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: {},
			textures: {},
			defines: {}
		};

		expect(() => resolveMaterial(rawMaterial as Parameters<typeof resolveMaterial>[0])).toThrow(
			/defineMaterial/
		);
	});
});
