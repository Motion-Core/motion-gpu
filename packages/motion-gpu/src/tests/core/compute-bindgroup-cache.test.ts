import { describe, expect, it, vi } from 'vitest';
import {
	createComputeStorageBindGroupCache,
	type ComputeStorageBindGroupCache
} from '../../lib/core/compute-bindgroup-cache';

type CacheWithDebug = ComputeStorageBindGroupCache & {
	readonly _refAt: (index: number) => unknown;
};

function createMockDevice() {
	return {
		createBindGroupLayout: vi.fn(
			(descriptor: GPUBindGroupLayoutDescriptor) =>
				({ descriptor }) as unknown as GPUBindGroupLayout
		),
		createBindGroup: vi.fn(
			(descriptor: GPUBindGroupDescriptor) => ({ descriptor }) as unknown as GPUBindGroup
		)
	} as unknown as GPUDevice;
}

function createTwoBufferRequest(
	topologyKey: string,
	refA: GPUBuffer,
	refB: GPUBuffer
): {
	topologyKey: string;
	layoutEntries: GPUBindGroupLayoutEntry[];
	bindGroupEntries: GPUBindGroupEntry[];
	resourceRefs: unknown[];
} {
	return {
		topologyKey,
		layoutEntries: [
			{ binding: 0, visibility: 0x20, buffer: { type: 'storage' } },
			{ binding: 1, visibility: 0x20, buffer: { type: 'storage' } }
		],
		bindGroupEntries: [
			{ binding: 0, resource: { buffer: refA } },
			{ binding: 1, resource: { buffer: refB } }
		],
		resourceRefs: [refA, refB]
	};
}

function createStorageBufferRequest(
	topologyKey: string,
	resourceRef: GPUBuffer
): {
	topologyKey: string;
	layoutEntries: GPUBindGroupLayoutEntry[];
	bindGroupEntries: GPUBindGroupEntry[];
	resourceRefs: unknown[];
} {
	return {
		topologyKey,
		layoutEntries: [
			{
				binding: 0,
				visibility: 0x20,
				buffer: { type: 'storage' }
			}
		],
		bindGroupEntries: [{ binding: 0, resource: { buffer: resourceRef } }],
		resourceRefs: [resourceRef]
	};
}

describe('createComputeStorageBindGroupCache', () => {
	it('reuses layout and bind group when topology and resource refs are stable', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device);
		const buffer = {} as GPUBuffer;
		const request = createStorageBufferRequest('data:read-write', buffer);

		const first = cache.getOrCreate(request);
		const second = cache.getOrCreate(request);

		expect(first).toBe(second);
		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(1);
		expect(device.createBindGroup).toHaveBeenCalledTimes(1);
	});

	it('recreates bind group when resource refs change but topology is unchanged', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device);
		const firstRequest = createStorageBufferRequest('data:read-write', {} as GPUBuffer);
		const secondRequest = createStorageBufferRequest('data:read-write', {} as GPUBuffer);

		const first = cache.getOrCreate(firstRequest);
		const second = cache.getOrCreate(secondRequest);

		expect(first).not.toBe(second);
		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(1);
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});

	it('reuses the internal resource refs backing array across cache misses of the same arity', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device);
		const firstRequest = createStorageBufferRequest('data:read-write', {} as GPUBuffer);
		const secondRequest = createStorageBufferRequest('data:read-write', {} as GPUBuffer);
		const resourceRefsIterator = vi.fn(
			secondRequest.resourceRefs[Symbol.iterator].bind(secondRequest.resourceRefs)
		);
		Object.defineProperty(secondRequest.resourceRefs, Symbol.iterator, {
			value: resourceRefsIterator
		});

		cache.getOrCreate(firstRequest);
		cache.getOrCreate(secondRequest);

		expect(resourceRefsIterator).not.toHaveBeenCalled();
	});

	it('recreates layout when topology changes', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device);
		const buffer = {} as GPUBuffer;

		cache.getOrCreate(createStorageBufferRequest('data:read-write', buffer));
		cache.getOrCreate({
			topologyKey: 'data:read',
			layoutEntries: [
				{
					binding: 0,
					visibility: 0x20,
					buffer: { type: 'read-only-storage' }
				}
			],
			bindGroupEntries: [{ binding: 0, resource: { buffer } }],
			resourceRefs: [buffer]
		});

		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(2);
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});

	it('nulls out stale backing-array slots when resource-ref count shrinks', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device) as unknown as CacheWithDebug;
		const bufferA = {} as GPUBuffer;
		const bufferB = {} as GPUBuffer;
		const bufferC = {} as GPUBuffer;

		cache.getOrCreate(createTwoBufferRequest('two-buf', bufferA, bufferB));
		cache.getOrCreate(createStorageBufferRequest('two-buf', bufferC));

		expect(cache._refAt(1)).toBeNull();
	});

	it('nulls out backing-array slots on reset', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device) as unknown as CacheWithDebug;
		const bufferA = {} as GPUBuffer;
		const bufferB = {} as GPUBuffer;

		cache.getOrCreate(createTwoBufferRequest('two-buf', bufferA, bufferB));
		cache.reset();

		expect(cache._refAt(0)).toBeNull();
		expect(cache._refAt(1)).toBeNull();
	});

	it('nulls out stale backing-array slots on topology change', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device) as unknown as CacheWithDebug;
		const bufferA = {} as GPUBuffer;
		const bufferB = {} as GPUBuffer;
		const bufferC = {} as GPUBuffer;

		cache.getOrCreate(createTwoBufferRequest('topology-A', bufferA, bufferB));
		cache.getOrCreate(createStorageBufferRequest('topology-B', bufferC));

		expect(cache._refAt(1)).toBeNull();
	});

	it('returns null for empty entries and clears cached state', () => {
		const device = createMockDevice();
		const cache = createComputeStorageBindGroupCache(device);
		const request = createStorageBufferRequest('data:read-write', {} as GPUBuffer);

		cache.getOrCreate(request);
		const empty = cache.getOrCreate({
			topologyKey: 'empty',
			layoutEntries: [],
			bindGroupEntries: [],
			resourceRefs: []
		});
		cache.getOrCreate(request);

		expect(empty).toBeNull();
		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(2);
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});
});
