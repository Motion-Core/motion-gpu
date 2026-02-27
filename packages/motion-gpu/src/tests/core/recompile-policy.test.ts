import { describe, expect, it } from 'vitest';
import { defineMaterial, resolveMaterial } from '../../lib/core/material';
import { buildRendererPipelineSignature } from '../../lib/core/recompile-policy';

describe('recompile policy', () => {
	it('does not require pipeline rebuild for uniform value changes with same layout', () => {
		const baseFragment = 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }';
		const materialA = resolveMaterial(
			defineMaterial({
				fragment: baseFragment,
				uniforms: { uMix: 0.1 }
			})
		);
		const materialB = resolveMaterial(
			defineMaterial({
				fragment: baseFragment,
				uniforms: { uMix: 0.9 }
			})
		);

		expect(materialA.signature).toBe(materialB.signature);
		expect(
			buildRendererPipelineSignature({
				materialSignature: materialA.signature,
				outputColorSpace: 'srgb'
			})
		).toBe(
			buildRendererPipelineSignature({
				materialSignature: materialB.signature,
				outputColorSpace: 'srgb'
			})
		);
	});

	it('requires rebuild when shader contract or output color space changes', () => {
		const a = resolveMaterial(
			defineMaterial({
				fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv.x, uv.y, 0.0, 1.0); }',
				defines: { USE_GRAIN: false }
			})
		);
		const b = resolveMaterial(
			defineMaterial({
				fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv.x, uv.y, 0.0, 1.0); }',
				defines: { USE_GRAIN: true }
			})
		);

		expect(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				outputColorSpace: 'srgb'
			})
		).not.toBe(
			buildRendererPipelineSignature({
				materialSignature: b.signature,
				outputColorSpace: 'srgb'
			})
		);

		expect(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				outputColorSpace: 'srgb'
			})
		).not.toBe(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				outputColorSpace: 'linear'
			})
		);
	});
});
