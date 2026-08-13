import { describe, expect, it, vi } from 'vitest';
import {
	createComputeBindGroupCache,
	type ComputeBindGroupCache
} from '../../lib/core/compute-bindgroup-cache';

function createMockDevice() {
	return {
		createBindGroup: vi.fn(
			(descriptor: GPUBindGroupDescriptor) => ({ descriptor }) as unknown as GPUBindGroup
		)
	} as unknown as GPUDevice;
}

function request(
	layout: GPUBindGroupLayout,
	topologyKey: string,
	resources: readonly GPUBindingResource[]
) {
	return {
		topologyKey,
		layout,
		entries: resources.map((resource, binding) => ({ binding, resource })),
		resourceRefs: resources.map((resource) => ('buffer' in resource ? resource.buffer : resource))
	};
}

describe('createComputeBindGroupCache', () => {
	it('reuses a bind group when the pipeline layout and physical refs are stable', () => {
		const device = createMockDevice();
		const cache = createComputeBindGroupCache(device);
		const layout = {} as GPUBindGroupLayout;
		const resources = [{} as GPUTextureView, {} as GPUSampler];
		const first = cache.getOrCreate(request(layout, 'sampled|sampler', resources));
		const second = cache.getOrCreate(request(layout, 'sampled|sampler', resources));
		expect(first).toBe(second);
		expect(device.createBindGroup).toHaveBeenCalledTimes(1);
	});

	it('recreates only the bind group when a physical resource changes', () => {
		const device = createMockDevice();
		const cache = createComputeBindGroupCache(device);
		const layout = {} as GPUBindGroupLayout;
		const first = cache.getOrCreate(request(layout, 'sampled', [{} as GPUTextureView]));
		const second = cache.getOrCreate(request(layout, 'sampled', [{} as GPUTextureView]));
		expect(first).not.toBe(second);
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});

	it('invalidates state when topology or pipeline-owned layout changes', () => {
		const device = createMockDevice();
		const cache = createComputeBindGroupCache(device);
		const view = {} as GPUTextureView;
		cache.getOrCreate(request({} as GPUBindGroupLayout, 'float', [view]));
		cache.getOrCreate(request({} as GPUBindGroupLayout, 'uint', [view]));
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});

	it('compares buffer objects rather than freshly-created GPUBufferBinding wrappers', () => {
		const device = createMockDevice();
		const cache = createComputeBindGroupCache(device);
		const layout = {} as GPUBindGroupLayout;
		const buffer = {} as GPUBuffer;
		const first = cache.getOrCreate(request(layout, 'buffer', [{ buffer, size: 64 }]));
		const second = cache.getOrCreate(request(layout, 'buffer', [{ buffer, size: 64 }]));
		expect(first).toBe(second);
		expect(device.createBindGroup).toHaveBeenCalledTimes(1);
	});

	it('returns null for an empty group and clears prior state', () => {
		const device = createMockDevice();
		const cache: ComputeBindGroupCache = createComputeBindGroupCache(device);
		const layout = {} as GPUBindGroupLayout;
		const resources = [{} as GPUTextureView];
		cache.getOrCreate(request(layout, 'sampled', resources));
		expect(cache.getOrCreate(request(layout, '', []))).toBeNull();
		cache.getOrCreate(request(layout, 'sampled', resources));
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});

	it('reset discards the previous bind group', () => {
		const device = createMockDevice();
		const cache = createComputeBindGroupCache(device);
		const layout = {} as GPUBindGroupLayout;
		const resources = [{} as GPUTextureView];
		cache.getOrCreate(request(layout, 'sampled', resources));
		cache.reset();
		cache.getOrCreate(request(layout, 'sampled', resources));
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});
});
