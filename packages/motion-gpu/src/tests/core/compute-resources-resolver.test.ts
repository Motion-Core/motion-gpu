import { describe, expect, it, vi } from 'vitest';
import {
	createComputeExternalResolutionState,
	normalizeComputeResourceMap,
	resolveComputePassResources,
	resolveComputeTextureFormat,
	type ComputeMaterialSamplerResource,
	type ComputeResourceResolverContext,
	type ComputeResourceResolverLimits
} from '../../lib/core/compute-resources';
import { toMotionGPUErrorReport, type MotionGPUErrorCode } from '../../lib/core/error-report';
import type {
	RuntimeStorageBufferResource,
	RuntimeTextureResource
} from '../../lib/core/resource-registry';
import type { ComputeResourceMap } from '../../lib/core/types';

const limits: ComputeResourceResolverLimits = {
	maxBindingsPerBindGroup: 32,
	maxSampledTexturesPerShaderStage: 16,
	maxSamplersPerShaderStage: 16,
	maxStorageTexturesPerShaderStage: 8,
	maxStorageBuffersPerShaderStage: 8,
	maxStorageBufferBindingSize: 1 << 20
};

function view(label: string): GPUTextureView {
	return { label } as unknown as GPUTextureView;
}

function texture(label: string, overrides: Record<string, unknown> = {}): GPUTexture {
	return {
		label,
		format: 'rgba8unorm',
		usage: 12,
		dimension: '2d',
		sampleCount: 1,
		depthOrArrayLayers: 1,
		mipLevelCount: 1,
		createView: vi.fn(() => view(`${label}-view`)),
		...overrides
	} as unknown as GPUTexture;
}

function materialTexture(
	logicalId: string,
	overrides: Partial<RuntimeTextureResource> = {}
): RuntimeTextureResource {
	const ownedTexture = texture(logicalId, {
		format: overrides.format ?? 'rgba8unorm',
		usage: overrides.usage ?? 12,
		mipLevelCount: overrides.mipLevelCount ?? 1
	});
	const sampledView = view(`${logicalId}-sampled`);
	return {
		logicalId,
		ownedTexture,
		storageView: view(`${logicalId}-storage`),
		sampledView,
		publishedView: sampledView,
		format: 'rgba8unorm',
		width: 64,
		height: 64,
		mipLevelCount: 1,
		sampleType: 'float',
		usage: 12 as GPUTextureUsageFlags,
		resourceVersion: 0,
		...overrides
	};
}

function materialBuffer(
	logicalId: string,
	overrides: Partial<RuntimeStorageBufferResource> = {}
): RuntimeStorageBufferResource {
	return {
		logicalId,
		buffer: { label: logicalId } as unknown as GPUBuffer,
		size: 256,
		wgslType: 'array<f32>',
		access: 'read-write',
		usage: 128 as GPUBufferUsageFlags,
		resourceVersion: 0,
		...overrides
	};
}

function resolverContext(
	options: {
		textures?: RuntimeTextureResource[];
		buffers?: RuntimeStorageBufferResource[];
		samplers?: ComputeMaterialSamplerResource[];
		features?: string[];
		limits?: Partial<ComputeResourceResolverLimits>;
		pingPong?: boolean;
		externalState?: ReturnType<typeof createComputeExternalResolutionState>;
	} = {}
): ComputeResourceResolverContext {
	const textures = new Map(
		(options.textures ?? []).map((resource) => [resource.logicalId, resource])
	);
	const buffers = new Map(
		(options.buffers ?? []).map((resource) => [resource.logicalId, resource])
	);
	const samplers = new Map(
		(options.samplers ?? []).map((resource) => [resource.logicalId, resource])
	);
	return {
		passLabel: 'Compute pass #2',
		deviceFeatures: new Set(options.features),
		limits: { ...limits, ...options.limits },
		externalContext: {
			device: {} as GPUDevice,
			width: 640,
			height: 360,
			time: 1.5,
			delta: 0.016
		},
		getMaterialTexture: (logicalId) => textures.get(logicalId),
		getMaterialStorageBuffer: (logicalId) => buffers.get(logicalId),
		getMaterialSampler: (logicalId) => samplers.get(logicalId),
		createTextureView: (resource, descriptor) =>
			(resource.createView as (descriptor?: GPUTextureViewDescriptor) => GPUTextureView)(
				descriptor
			),
		...(options.pingPong !== undefined ? { pingPong: options.pingPong } : {}),
		...(options.externalState ? { externalState: options.externalState } : {})
	};
}

function diagnosticCode(run: () => unknown): MotionGPUErrorCode {
	try {
		run();
	} catch (error) {
		return toMotionGPUErrorReport(error, 'render').code;
	}
	throw new Error('Expected diagnostic operation to throw.');
}

describe('resolveComputeTextureFormat', () => {
	it.each([
		['rgba8unorm', [], 'f32', 'float'],
		['rgba8unorm-srgb', [], 'f32', 'float'],
		['rgba16float', [], 'f32', 'float'],
		['rgba32float', [], 'f32', 'unfilterable-float'],
		['rgba32float', ['float32-filterable'], 'f32', 'float'],
		['r32uint', [], 'u32', 'uint'],
		['r32sint', [], 'i32', 'sint']
	] as const)('maps %s with features %j to %s / %s', (format, features, scalarType, sampleType) => {
		expect(resolveComputeTextureFormat(format, new Set<string>(features))).toEqual({
			scalarType,
			sampleType
		});
	});

	it('rejects depth and stencil formats', () => {
		expect(() => resolveComputeTextureFormat('depth32float', new Set())).toThrow(
			/not a supported 2D color format/
		);
	});
});

describe('resolveComputePassResources', () => {
	it('reuses maps produced by the normalizer without trusting arbitrary frozen input', () => {
		const normalized = normalizeComputeResourceMap({
			uInput: { texture: 'camera', access: 'sampled' }
		});
		expect(normalizeComputeResourceMap(normalized)).toBe(normalized);

		const invalidFrozen = Object.freeze({
			uInput: Object.freeze({ texture: 'camera', access: 'invalid' })
		}) as unknown as ComputeResourceMap;
		expect(() => normalizeComputeResourceMap(invalidFrozen)).toThrow(/texture access/);
	});

	it('emits stable diagnostic codes at resolver failure sites', () => {
		expect(() => normalizeComputeResourceMap([] as unknown as ComputeResourceMap)).toThrow();
		expect(
			diagnosticCode(() => normalizeComputeResourceMap([] as unknown as ComputeResourceMap))
		).toBe('COMPUTE_RESOURCE_DESCRIPTOR_INVALID');
		expect(
			diagnosticCode(() =>
				normalizeComputeResourceMap({
					motiongpuFrame: { texture: 'camera', access: 'sampled' }
				})
			)
		).toBe('COMPUTE_RESOURCE_ALIAS_COLLISION');
		expect(
			diagnosticCode(() =>
				resolveComputePassResources(
					{ uMissing: { texture: 'missing', access: 'sampled' } },
					resolverContext()
				)
			)
		).toBe('COMPUTE_RESOURCE_UNKNOWN');
		expect(
			diagnosticCode(() =>
				resolveComputePassResources(
					{ uOutput: { texture: 'sampled-only', access: 'storage-write' } },
					resolverContext({ textures: [materialTexture('sampled-only', { usage: 4 })] })
				)
			)
		).toBe('COMPUTE_RESOURCE_INCOMPATIBLE');
		expect(
			diagnosticCode(() =>
				resolveComputePassResources(
					{
						uRead: { texture: 'shared', access: 'sampled' },
						uWrite: { texture: 'shared', access: 'storage-write' }
					},
					resolverContext({ textures: [materialTexture('shared')] })
				)
			)
		).toBe('COMPUTE_RESOURCE_HAZARD');
		expect(
			diagnosticCode(() =>
				resolveComputePassResources(
					{ uInput: { texture: 'camera', access: 'sampled' } },
					resolverContext({
						textures: [materialTexture('camera')],
						limits: { maxBindingsPerBindGroup: 0 }
					})
				)
			)
		).toBe('COMPUTE_RESOURCE_LIMIT_EXCEEDED');
		expect(
			diagnosticCode(() =>
				resolveComputePassResources(
					{
						uRaw: {
							texture: {
								externalTexture: texture('wrong-format'),
								resourceId: 'raw',
								format: 'rgba16float',
								usage: 12
							},
							access: 'sampled'
						}
					},
					resolverContext()
				)
			)
		).toBe('COMPUTE_EXTERNAL_RESOURCE_INVALID');
	});

	it('resolves an empty map without a pass-local bind group', () => {
		const resolved = resolveComputePassResources({}, resolverContext());
		expect(resolved).toEqual({
			entries: [],
			reads: [],
			writes: [],
			topologyKey: '',
			bindingCount: 0
		});
	});

	it('builds one sorted heterogeneous model for shader, layout, bindings, and graph access', () => {
		const camera = materialTexture('camera');
		const motion = materialTexture('motion', { format: 'rgba16float' });
		const particles = materialBuffer('particles', { wgslType: 'array<vec4f>' });
		const cameraSampler = {} as GPUSampler;
		const resources: ComputeResourceMap = {
			zOutput: { texture: 'motion', access: 'storage-write' },
			mSampler: { sampler: 'camera' },
			aParticles: { buffer: 'particles', access: 'storage-read' },
			bCamera: { texture: 'camera', access: 'sampled', version: 'initial' }
		};
		const resolved = resolveComputePassResources(
			resources,
			resolverContext({
				textures: [camera, motion],
				buffers: [particles],
				samplers: [
					{
						logicalId: 'camera',
						sampler: cameraSampler,
						type: 'filtering',
						sampleType: 'float'
					}
				]
			})
		);

		expect(resolved.entries.map((entry) => [entry.alias, entry.binding, entry.kind])).toEqual([
			['aParticles', 0, 'storage-buffer'],
			['bCamera', 1, 'sampled-texture'],
			['mSampler', 2, 'sampler'],
			['zOutput', 3, 'storage-texture']
		]);
		expect(resolved.entries.map((entry) => entry.layoutEntry.binding)).toEqual([0, 1, 2, 3]);
		expect(resolved.reads.map((access) => [access.alias, access.version])).toEqual([
			['aParticles', 'current'],
			['bCamera', 'initial']
		]);
		expect(resolved.writes.map((access) => access.alias)).toEqual(['zOutput']);
		expect(resolved.bindingCount).toBe(4);
		expect(Object.isFrozen(resolved.entries)).toBe(true);
	});

	it('keeps material keys out of the pipeline topology signature', () => {
		const first = resolveComputePassResources(
			{ uInput: { texture: 'cameraA', access: 'sampled' } },
			resolverContext({ textures: [materialTexture('cameraA')] })
		);
		const second = resolveComputePassResources(
			{ uInput: { texture: 'cameraB', access: 'sampled' } },
			resolverContext({ textures: [materialTexture('cameraB')] })
		);
		expect(first.topologyKey).toBe(second.topologyKey);
	});

	it('keys pipelines by binding contract rather than read version, float format, or buffer size', () => {
		const first = resolveComputePassResources(
			{
				uInput: { texture: 'inputA', access: 'sampled', version: 'initial' },
				uData: { buffer: 'dataA', access: 'storage-read' }
			},
			resolverContext({
				textures: [materialTexture('inputA', { format: 'rgba8unorm' })],
				buffers: [materialBuffer('dataA', { size: 256 })]
			})
		);
		const second = resolveComputePassResources(
			{
				uInput: { texture: 'inputB', access: 'sampled', version: 'current' },
				uData: { buffer: 'dataB', access: 'storage-read' }
			},
			resolverContext({
				textures: [materialTexture('inputB', { format: 'rgba16float' })],
				buffers: [materialBuffer('dataB', { size: 512 })]
			})
		);
		expect(first.topologyKey).toBe(second.topologyKey);
	});

	it('reports unknown material textures, buffers, and samplers with pass and alias', () => {
		for (const resources of [
			{ uMissing: { texture: 'missing', access: 'sampled' } },
			{ uMissing: { buffer: 'missing', access: 'storage-read' } },
			{ uMissing: { sampler: 'missing' } }
		] as ComputeResourceMap[]) {
			expect(() => resolveComputePassResources(resources, resolverContext())).toThrow(
				/Compute pass #2 resource "uMissing" references unknown material/
			);
		}
	});

	it('requires storage declarations, compatible formats, and writable material buffers', () => {
		expect(() =>
			resolveComputePassResources(
				{ uOutput: { texture: 'output', access: 'storage-write' } },
				resolverContext({ textures: [materialTexture('output', { usage: 4 })] })
			)
		).toThrow(/without GPUTextureUsage.STORAGE_BINDING/);

		expect(() =>
			resolveComputePassResources(
				{ uOutput: { texture: 'output', access: 'storage-write' } },
				resolverContext({
					textures: [materialTexture('output', { format: 'rgba8unorm-srgb' })]
				})
			)
		).toThrow(/not storage-write compatible/);

		expect(() =>
			resolveComputePassResources(
				{ data: { buffer: 'data', access: 'storage-read-write' } },
				resolverContext({ buffers: [materialBuffer('data', { access: 'read' })] })
			)
		).toThrow(/declared with access "read"/);
	});

	it('models storage-read-write as an imported read plus current write', () => {
		const resolved = resolveComputePassResources(
			{ data: { buffer: 'data', access: 'storage-read-write' } },
			resolverContext({ buffers: [materialBuffer('data')] })
		);
		expect(resolved.reads).toMatchObject([{ alias: 'data', mode: 'read', version: 'initial' }]);
		expect(resolved.writes).toMatchObject([{ alias: 'data', mode: 'write', version: 'current' }]);
	});

	it('rejects same-dispatch sampled/write and multiple-write texture overlaps', () => {
		const shared = materialTexture('shared');
		for (const resources of [
			{
				uRead: { texture: 'shared', access: 'sampled' },
				uWrite: { texture: 'shared', access: 'storage-write' }
			},
			{
				uWriteA: { texture: 'shared', access: 'storage-write' },
				uWriteB: { texture: 'shared', access: 'storage-write' }
			}
		] as ComputeResourceMap[]) {
			expect(() =>
				resolveComputePassResources(resources, resolverContext({ textures: [shared] }))
			).toThrow(/overlaps.*at least one alias is writable/);
		}
	});

	it('allows disjoint texture mip ranges and duplicate read-only aliases', () => {
		const shared = materialTexture('shared', { mipLevelCount: 2 });
		const disjoint = resolveComputePassResources(
			{
				uRead: {
					texture: 'shared',
					access: 'sampled',
					view: { baseMipLevel: 0, mipLevelCount: 1 }
				},
				uWrite: {
					texture: 'shared',
					access: 'storage-write',
					view: { baseMipLevel: 1, mipLevelCount: 1 }
				}
			},
			resolverContext({ textures: [shared] })
		);
		expect(disjoint.entries).toHaveLength(2);

		const reads = resolveComputePassResources(
			{
				uReadA: { texture: 'shared', access: 'sampled' },
				uReadB: { texture: 'shared', access: 'sampled' }
			},
			resolverContext({ textures: [shared] })
		);
		expect(reads.reads).toHaveLength(2);
	});

	it('enforces texture view bounds and one storage mip', () => {
		const shared = materialTexture('shared', { mipLevelCount: 2 });
		expect(() =>
			resolveComputePassResources(
				{
					uRead: {
						texture: 'shared',
						access: 'sampled',
						view: { baseMipLevel: 2 }
					}
				},
				resolverContext({ textures: [shared] })
			)
		).toThrow(/outside 2 available mip level/);
		expect(() =>
			resolveComputePassResources(
				{
					uWrite: {
						texture: 'shared',
						access: 'storage-write',
						view: { mipLevelCount: 2 }
					}
				},
				resolverContext({ textures: [shared] })
			)
		).toThrow(/storage-write view must expose exactly one mip level/);
	});

	it('allows only the structural read/write overlap of a ping-pong pass', () => {
		const shared = materialTexture('shared');
		const resources: ComputeResourceMap = {
			uPrevious: { texture: 'shared', access: 'sampled', pingPong: 'read' },
			uNext: { texture: 'shared', access: 'storage-write', pingPong: 'write' }
		};
		expect(
			resolveComputePassResources(
				resources,
				resolverContext({ textures: [shared], pingPong: true })
			).entries
		).toHaveLength(2);
		expect(() =>
			resolveComputePassResources(resources, resolverContext({ textures: [shared] }))
		).toThrow(/pingPong role on a normal ComputePass/);
	});

	it('validates material sampler compatibility and rejects comparison samplers', () => {
		const sampler = {} as GPUSampler;
		expect(() =>
			resolveComputePassResources(
				{ uSampler: { sampler: 'integer' } },
				resolverContext({
					samplers: [
						{
							logicalId: 'integer',
							sampler,
							type: 'filtering',
							sampleType: 'uint'
						}
					]
				})
			)
		).toThrow(/filtering sampler is incompatible with uint/);

		expect(() =>
			resolveComputePassResources(
				{ uSampler: { sampler: 'depth' } },
				resolverContext({
					samplers: [
						{
							logicalId: 'depth',
							sampler,
							type: 'comparison',
							sampleType: 'float'
						}
					]
				})
			)
		).toThrow(/comparison samplers/);
	});

	it('snapshots a shared external provider once and validates raw metadata', () => {
		const external = texture('external');
		const provider = vi.fn(() => external);
		const resources: ComputeResourceMap = {
			uFirst: {
				texture: {
					externalTexture: provider,
					resourceId: 'external',
					format: 'rgba8unorm',
					usage: 12
				},
				access: 'sampled'
			},
			uSecond: {
				texture: {
					externalTexture: provider,
					resourceId: 'external',
					format: 'rgba8unorm',
					usage: 12
				},
				access: 'sampled'
			}
		};
		const resolved = resolveComputePassResources(resources, resolverContext());
		expect(provider).toHaveBeenCalledTimes(1);
		expect(provider).toHaveBeenCalledWith(
			expect.objectContaining({ width: 640, height: 360, time: 1.5 })
		);
		expect(resolved.entries).toHaveLength(2);

		const wrongFormat = texture('wrong');
		expect(() =>
			resolveComputePassResources(
				{
					uRaw: {
						texture: {
							externalTexture: wrongFormat,
							resourceId: 'wrong',
							format: 'rgba16float',
							usage: 12
						},
						access: 'sampled'
					}
				},
				resolverContext()
			)
		).toThrow(/declares format "rgba16float"/);
	});

	it('resolves borrowed texture, buffer, and sampler objects without taking ownership', () => {
		const destroyTexture = vi.fn();
		const destroyBuffer = vi.fn();
		const rawTexture = texture('raw', { destroy: destroyTexture });
		const rawBuffer = { size: 64, usage: 128, destroy: destroyBuffer } as unknown as GPUBuffer;
		const rawSampler = {} as GPUSampler;
		const resolved = resolveComputePassResources(
			{
				uTexture: {
					texture: {
						externalTexture: rawTexture,
						resourceId: 'raw-texture',
						format: 'rgba8unorm',
						usage: 12
					},
					access: 'sampled'
				},
				uBuffer: {
					buffer: {
						externalBuffer: rawBuffer,
						resourceId: 'raw-buffer',
						wgslType: 'array<vec4f>',
						size: 64,
						usage: 128
					},
					access: 'storage-read'
				},
				uSampler: {
					sampler: {
						externalSampler: rawSampler,
						resourceId: 'raw-sampler',
						type: 'non-filtering'
					}
				}
			},
			resolverContext()
		);

		expect(resolved.entries.map((entry) => entry.source)).toEqual([
			'external',
			'external',
			'external'
		]);
		const bufferEntry = resolved.entries.find((entry) => entry.kind === 'storage-buffer');
		const samplerEntry = resolved.entries.find((entry) => entry.kind === 'sampler');
		expect(bufferEntry?.bindingResource).toEqual({ buffer: rawBuffer, size: 64 });
		expect(samplerEntry?.bindingResource).toBe(rawSampler);
		expect(destroyTexture).not.toHaveBeenCalled();
		expect(destroyBuffer).not.toHaveBeenCalled();
	});

	it('changes physical provider results without changing topology', () => {
		const firstTexture = texture('first');
		const secondTexture = texture('second');
		const provider = vi
			.fn<() => GPUTexture>()
			.mockReturnValueOnce(firstTexture)
			.mockReturnValueOnce(secondTexture);
		const resources: ComputeResourceMap = {
			uRaw: {
				texture: {
					externalTexture: provider,
					resourceId: 'raw',
					format: 'rgba8unorm',
					usage: 12
				},
				access: 'sampled'
			}
		};
		const first = resolveComputePassResources(resources, resolverContext());
		const second = resolveComputePassResources(resources, resolverContext());
		expect(provider).toHaveBeenCalledTimes(2);
		expect(first.topologyKey).toBe(second.topologyKey);
		expect(first.entries[0]?.bindingResource).not.toBe(second.entries[0]?.bindingResource);
	});

	it('wraps external provider failures and invalid results with pass context', () => {
		const throwingProvider = vi.fn((): GPUTexture => {
			throw new Error('device was replaced');
		});
		expect(() =>
			resolveComputePassResources(
				{
					uRaw: {
						texture: {
							externalTexture: throwingProvider,
							resourceId: 'raw',
							format: 'rgba8unorm',
							usage: 4
						},
						access: 'sampled'
					}
				},
				resolverContext()
			)
		).toThrow(/Compute pass #2 resource "uRaw" external provider failed: device was replaced/);

		const invalidProvider = (() => null) as unknown as () => GPUTexture;
		expect(() =>
			resolveComputePassResources(
				{
					uRaw: {
						texture: {
							externalTexture: invalidProvider,
							resourceId: 'raw',
							format: 'rgba8unorm',
							usage: 4
						},
						access: 'sampled'
					}
				},
				resolverContext()
			)
		).toThrow(/external provider returned an invalid WebGPU object/);
	});

	it('rejects one external object declared under conflicting resource identities', () => {
		const external = texture('external');
		expect(() =>
			resolveComputePassResources(
				{
					uFirst: {
						texture: {
							externalTexture: external,
							resourceId: 'one',
							format: 'rgba8unorm',
							usage: 12
						},
						access: 'sampled'
					},
					uSecond: {
						texture: {
							externalTexture: external,
							resourceId: 'two',
							format: 'rgba8unorm',
							usage: 12
						},
						access: 'sampled'
					}
				},
				resolverContext()
			)
		).toThrow(/same object was already declared/);
	});

	it('rejects conflicting metadata for one stable external identity', () => {
		const external = texture('shared');
		expect(() =>
			resolveComputePassResources(
				{
					uFirst: {
						texture: {
							externalTexture: external,
							resourceId: 'shared',
							format: 'rgba8unorm',
							usage: 12
						},
						access: 'sampled'
					},
					uSecond: {
						texture: {
							externalTexture: external,
							resourceId: 'shared',
							format: 'rgba16float',
							usage: 12
						},
						access: 'sampled'
					}
				},
				resolverContext()
			)
		).toThrow(/declares metadata.*previously declared/);
	});

	it('snapshots one external provider across all passes in a frame', () => {
		const provider = vi.fn(() => texture('frame-texture'));
		const externalState = createComputeExternalResolutionState();
		const descriptor = {
			texture: {
				externalTexture: provider,
				resourceId: 'frame-texture',
				format: 'rgba8unorm' as GPUTextureFormat,
				usage: 12
			},
			access: 'sampled' as const
		};
		resolveComputePassResources({ firstInput: descriptor }, resolverContext({ externalState }));
		resolveComputePassResources({ secondInput: descriptor }, resolverContext({ externalState }));
		expect(provider).toHaveBeenCalledTimes(1);
	});

	it('rejects one external identity resolving to multiple texture objects in a frame', () => {
		const externalState = createComputeExternalResolutionState();
		resolveComputePassResources(
			{
				firstInput: {
					texture: {
						externalTexture: texture('first-object'),
						resourceId: 'shared-texture',
						format: 'rgba8unorm',
						usage: 12
					},
					access: 'sampled'
				}
			},
			resolverContext({ externalState })
		);
		expect(() =>
			resolveComputePassResources(
				{
					secondInput: {
						texture: {
							externalTexture: texture('second-object'),
							resourceId: 'shared-texture',
							format: 'rgba8unorm',
							usage: 12
						},
						access: 'sampled'
					}
				},
				resolverContext({ externalState })
			)
		).toThrow(/resolved to multiple physical objects in one frame/);
	});

	it('validates external buffers and fixed external texture views', () => {
		const buffer = { size: 32, usage: 128 } as GPUBuffer;
		expect(() =>
			resolveComputePassResources(
				{
					uBuffer: {
						buffer: {
							externalBuffer: buffer,
							resourceId: 'buffer',
							wgslType: 'array<f32>',
							size: 64,
							usage: 128
						},
						access: 'storage-read'
					}
				},
				resolverContext()
			)
		).toThrow(/declares size 64/);

		expect(() =>
			resolveComputePassResources(
				{
					uView: {
						texture: {
							externalView: view('external'),
							resourceId: 'view',
							format: 'rgba8unorm',
							usage: 4,
							viewDimension: '2d',
							mipLevelCount: 2
						},
						access: 'sampled',
						view: { mipLevelCount: 1 }
					}
				},
				resolverContext()
			)
		).toThrow(/externalView already represents a fixed view/);
	});

	it('detects raw view hazards by stable parent resourceId', () => {
		const sharedReadView = view('read');
		const sharedWriteView = view('write');
		expect(() =>
			resolveComputePassResources(
				{
					uRead: {
						texture: {
							externalView: sharedReadView,
							resourceId: 'parent-texture',
							format: 'rgba8unorm',
							usage: 12,
							viewDimension: '2d',
							mipLevelCount: 1
						},
						access: 'sampled'
					},
					uWrite: {
						texture: {
							externalView: sharedWriteView,
							resourceId: 'parent-texture',
							format: 'rgba8unorm',
							usage: 12,
							viewDimension: '2d',
							mipLevelCount: 1
						},
						access: 'storage-write'
					}
				},
				resolverContext()
			)
		).toThrow(/overlaps.*at least one alias is writable/);
	});

	it('checks bind-group, per-stage, and storage-buffer size limits before codegen', () => {
		expect(() =>
			resolveComputePassResources(
				{
					uA: { texture: 'a', access: 'sampled' },
					uB: { texture: 'b', access: 'sampled' }
				},
				resolverContext({
					textures: [materialTexture('a'), materialTexture('b')],
					limits: { maxSampledTexturesPerShaderStage: 1 }
				})
			)
		).toThrow(/requires 2 maxSampledTexturesPerShaderStage, device limit is 1/);

		expect(() =>
			resolveComputePassResources(
				{ data: { buffer: 'data', access: 'storage-read' } },
				resolverContext({
					buffers: [materialBuffer('data', { size: 512 })],
					limits: { maxStorageBufferBindingSize: 256 }
				})
			)
		).toThrow(/exceeding maxStorageBufferBindingSize 256/);
	});
});
