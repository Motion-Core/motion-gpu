import { describe, expect, it, vi } from 'vitest';
import {
	applyMaterialDefines,
	buildDefinesBlock,
	defineMaterial,
	resolveMaterial
} from '../../lib/core/material';

function assertType<T>(value: T): void {
	void value;
}

describe('material', () => {
	function withMockedStack<T>(stack: string, run: () => T): T {
		const OriginalError = globalThis.Error;
		class MockError extends OriginalError {
			constructor(message?: string) {
				super(message);
				this.stack = stack;
			}
		}

		vi.stubGlobal('Error', MockError);
		try {
			return run();
		} finally {
			vi.unstubAllGlobals();
		}
	}

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

	it('preserves uniform and texture key unions on defined materials', () => {
		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: { uMix: 0.5 },
			textures: { uMain: {} }
		});

		type UniformKeys = keyof typeof material.uniforms;
		type TextureKeys = keyof typeof material.textures;

		const uniformKey: UniformKeys = 'uMix';
		const textureKey: TextureKeys = 'uMain';
		expect(uniformKey).toBe('uMix');
		expect(textureKey).toBe('uMain');
		expect(material.uniforms.uMix).toBe(0.5);
		expect(material.textures.uMain).toEqual({});

		// @ts-expect-error unknown uniform key should not be allowed
		assertType<UniformKeys>('uOther');
		// @ts-expect-error unknown texture key should not be allowed
		assertType<TextureKeys>('uOther');
	});

	it('clones mutable uniform and texture inputs to avoid external mutation side effects', () => {
		const matrix = new Float32Array(16);
		matrix[0] = 1;
		const tint: [number, number, number, number] = [1, 0.5, 0.25, 1];
		const canvas = document.createElement('canvas');
		canvas.width = 16;
		canvas.height = 8;
		const texturePayload: {
			source: HTMLCanvasElement;
			width: number;
			height: number;
			colorSpace: 'srgb' | 'linear';
			flipY: boolean;
			premultipliedAlpha: boolean;
			generateMipmaps: boolean;
			update: 'once' | 'onInvalidate' | 'perFrame';
		} = {
			source: canvas,
			width: 16,
			height: 8,
			colorSpace: 'linear',
			flipY: false,
			premultipliedAlpha: true,
			generateMipmaps: true,
			update: 'onInvalidate'
		};

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: {
				uTint: tint,
				uTransform: { type: 'mat4x4f', value: matrix }
			},
			textures: {
				uMain: { source: texturePayload }
			}
		});

		tint[0] = 0;
		matrix[0] = 9;
		texturePayload.width = 2;
		texturePayload.colorSpace = 'srgb';
		texturePayload.flipY = true;
		texturePayload.premultipliedAlpha = false;
		texturePayload.generateMipmaps = false;
		texturePayload.update = 'once';

		expect(material.uniforms.uTint).toEqual([1, 0.5, 0.25, 1]);
		expect(
			(material.uniforms.uTransform as { type: 'mat4x4f'; value: Float32Array }).value[0]
		).toBe(1);
		expect(
			(material.textures.uMain?.source as { source: HTMLCanvasElement; width?: number }).width
		).toBe(16);
		expect(
			(
				material.textures.uMain?.source as {
					colorSpace?: 'srgb' | 'linear';
					flipY?: boolean;
					premultipliedAlpha?: boolean;
					generateMipmaps?: boolean;
					update?: 'once' | 'onInvalidate' | 'perFrame';
				}
			).colorSpace
		).toBe('linear');
		expect(
			(material.textures.uMain?.source as { flipY?: boolean; premultipliedAlpha?: boolean }).flipY
		).toBe(false);
		expect(
			(material.textures.uMain?.source as { premultipliedAlpha?: boolean }).premultipliedAlpha
		).toBe(true);
		expect((material.textures.uMain?.source as { generateMipmaps?: boolean }).generateMipmaps).toBe(
			true
		);
		expect((material.textures.uMain?.source as { update?: string }).update).toBe('onInvalidate');
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
				fragment: 'fn frag(coords: vec2f) -> vec4f { return vec4f(coords, 0.0, 1.0); }'
			})
		).toThrow(/\(uv: vec2f\).+coords: vec2f/);

		expect(() =>
			defineMaterial({
				fragment: 'fn frag(uv: vec2f) -> vec3f { return vec3f(uv, 0.0); }'
			})
		).toThrow(/expected return type `vec4f`, received `vec3f`/);

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

	it('captures source metadata from chrome-like stack traces', () => {
		const resolved = withMockedStack(
			[
				'Error',
				'    at resolveSourceMetadata (/workspace/src/lib/core/material.ts:249:15)',
				'    at createOceanMaterial (/app/routes/Ocean.svelte:48:9)'
			].join('\n'),
			() =>
				resolveMaterial(
					defineMaterial({
						fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
					})
				)
		);

		expect(resolved.source).toMatchObject({
			component: 'Ocean.svelte',
			file: '/app/routes/Ocean.svelte',
			line: 48,
			column: 9,
			functionName: 'createOceanMaterial'
		});
	});

	it('captures source metadata from firefox-like stack traces', () => {
		const resolved = withMockedStack(
			[
				'Error',
				'resolveSourceMetadata@http://localhost/src/lib/core/material.ts:249:15',
				'buildScene@http://localhost/src/routes/+page.svelte:88:12'
			].join('\n'),
			() =>
				resolveMaterial(
					defineMaterial({
						fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
					})
				)
		);

		expect(resolved.source).toMatchObject({
			component: '+page.svelte',
			file: 'http://localhost/src/routes/+page.svelte',
			line: 88,
			column: 12,
			functionName: 'buildScene'
		});
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
