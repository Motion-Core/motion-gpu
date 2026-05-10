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
				color: {}
			})
		).toBe(
			buildRendererPipelineSignature({
				materialSignature: materialB.signature,
				color: {}
			})
		);
	});

	it('requires rebuild when shader contract or color pipeline changes', () => {
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
				color: {}
			})
		).not.toBe(
			buildRendererPipelineSignature({
				materialSignature: b.signature,
				color: {}
			})
		);

		expect(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				color: {}
			})
		).not.toBe(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				color: { outputEncoding: 'linear' }
			})
		);

		expect(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				color: {}
			})
		).not.toBe(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				color: { toneMapping: 'khronos-pbr-neutral' }
			})
		);

		expect(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				color: { dynamicRange: 'sdr' }
			})
		).not.toBe(
			buildRendererPipelineSignature({
				materialSignature: a.signature,
				color: { dynamicRange: 'hdr' }
			})
		);
	});
});
