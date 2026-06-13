import { describe, expect, it } from 'vitest';
import { defineMaterial, resolveMaterial } from '../../lib/core/material';
import { buildRendererPipelineSignature } from '../../lib/core/recompile-policy';

describe('recompile policy', () => {
	const buildSignature = (
		input: Partial<Parameters<typeof buildRendererPipelineSignature>[0]>
	): string =>
		buildRendererPipelineSignature({
			materialSignature: 'material',
			...input
		});

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

	it('requires rebuild when adapter request options change', () => {
		expect(buildSignature({ adapterOptions: { powerPreference: 'low-power' } })).not.toBe(
			buildSignature({ adapterOptions: { powerPreference: 'high-performance' } })
		);
	});

	it('requires rebuild when device descriptor label or limits change', () => {
		expect(buildSignature({ deviceDescriptor: { label: 'renderer-a' } })).not.toBe(
			buildSignature({ deviceDescriptor: { label: 'renderer-b' } })
		);

		expect(
			buildSignature({
				deviceDescriptor: { requiredLimits: { maxTextureDimension2D: 1024 } }
			})
		).not.toBe(
			buildSignature({
				deviceDescriptor: { requiredLimits: { maxTextureDimension2D: 2048 } }
			})
		);
	});

	it('normalizes object key order and requiredFeatures order in device descriptors', () => {
		const a = buildSignature({
			deviceDescriptor: {
				requiredFeatures: ['shader-f16', 'depth-clip-control'],
				requiredLimits: {
					maxStorageBuffersPerShaderStage: 8,
					maxTextureDimension2D: 1024
				}
			}
		});
		const b = buildSignature({
			deviceDescriptor: {
				requiredLimits: {
					maxTextureDimension2D: 1024,
					maxStorageBuffersPerShaderStage: 8
				},
				requiredFeatures: ['depth-clip-control', 'shader-f16']
			}
		});

		expect(a).toBe(b);
	});

	it('omits undefined adapter and descriptor fields from signatures', () => {
		expect(
			buildSignature({
				adapterOptions: { powerPreference: undefined } as unknown as GPURequestAdapterOptions
			})
		).toBe(buildSignature({ adapterOptions: {} }));
		expect(
			buildSignature({ deviceDescriptor: { label: undefined } as unknown as GPUDeviceDescriptor })
		).toBe(buildSignature({ deviceDescriptor: {} }));
	});
});
