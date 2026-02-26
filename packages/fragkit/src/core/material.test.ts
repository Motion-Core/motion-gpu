import { describe, expect, it } from 'vitest';
import {
	applyMaterialDefines,
	buildDefinesBlock,
	createMaterial,
	resolveMaterial
} from '../lib/core/material';

describe('material', () => {
	it('creates material snapshots', () => {
		const input = createMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: { uMix: 0.5 },
			defines: { USE_MIX: true }
		});

		expect(input.uniforms).toEqual({ uMix: 0.5 });
		expect(input.defines).toEqual({ USE_MIX: true });
	});

	it('builds and applies define blocks', () => {
		const block = buildDefinesBlock({
			USE_FOG: true,
			INTENSITY: 2,
			MODE: 'vec2f(1.0, 2.0)'
		});

		expect(block).toContain('const USE_FOG: bool = true;');
		expect(block).toContain('const INTENSITY: f32 = 2.0;');
		expect(block).toContain('const MODE = vec2f(1.0, 2.0);');

		const withDefines = applyMaterialDefines(
			'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			{ USE_FOG: false }
		);

		expect(withDefines).toContain('const USE_FOG: bool = false;');
		expect(withDefines).toContain('fn frag(uv: vec2f) -> vec4f');
	});

	it('resolves material from legacy props and tracks signature', () => {
		const resolved = resolveMaterial({
			fragmentWgsl: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: { b: 1, a: 0 },
			textures: { z: {}, x: {} }
		});

		expect(resolved.uniformKeys).toEqual(['a', 'b']);
		expect(resolved.textureKeys).toEqual(['x', 'z']);
		expect(resolved.signature).toContain('"uniformKeys":["a","b"]');
	});

	it('changes signature when defines change', () => {
		const baseFragment = 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }';
		const a = resolveMaterial({
			material: createMaterial({
				fragment: baseFragment,
				defines: { USE_GRAIN: true }
			})
		});
		const b = resolveMaterial({
			material: createMaterial({
				fragment: baseFragment,
				defines: { USE_GRAIN: false }
			})
		});

		expect(a.signature).not.toEqual(b.signature);
	});
});
