import { describe, expect, it } from 'vitest';
import { MaterialResourceRegistry } from '../../lib/core/resource-registry';

function textureView(label: string): GPUTextureView {
	return { label } as unknown as GPUTextureView;
}

describe('MaterialResourceRegistry', () => {
	it('registers a logical texture with separate sampled, storage, and published roles', () => {
		const registry = new MaterialResourceRegistry();
		const sampledView = textureView('sampled');
		const publishedView = textureView('published');
		const resource = registry.registerTexture({
			logicalId: 'motion',
			sampledView,
			publishedView,
			format: 'rgba16float',
			width: 64,
			height: 32,
			mipLevelCount: 2,
			sampleType: 'float',
			usage: 7 as GPUTextureUsageFlags
		});

		expect(resource).toMatchObject({
			logicalId: 'motion',
			ownedTexture: null,
			storageView: null,
			sampledView,
			publishedView,
			format: 'rgba16float',
			width: 64,
			height: 32,
			mipLevelCount: 2,
			sampleType: 'float',
			usage: 7,
			resourceVersion: 0
		});
		expect(registry.getTexture('motion')).toBe(resource);
	});

	it('atomically replaces texture allocation and publishes its sampled view', () => {
		const registry = new MaterialResourceRegistry();
		const fallback = textureView('fallback');
		const resource = registry.registerTexture({
			logicalId: 'camera',
			sampledView: fallback,
			format: 'rgba8unorm',
			mipLevelCount: 1,
			sampleType: 'float',
			usage: 1 as GPUTextureUsageFlags
		});
		const texture = {} as GPUTexture;
		const sampledView = textureView('sampled');
		const storageView = textureView('storage');
		const allocation = {
			ownedTexture: texture,
			storageView,
			sampledView,
			format: 'rgba8unorm' as GPUTextureFormat,
			width: 128,
			height: 64,
			mipLevelCount: 4,
			usage: 3 as GPUTextureUsageFlags
		};

		expect(registry.replaceTextureAllocation('camera', allocation)).toBe(true);
		expect(resource).toMatchObject({
			ownedTexture: texture,
			storageView,
			sampledView,
			publishedView: sampledView,
			width: 128,
			height: 64,
			mipLevelCount: 4,
			resourceVersion: 1
		});

		expect(registry.replaceTextureAllocation('camera', allocation)).toBe(false);
		expect(resource.resourceVersion).toBe(1);
	});

	it('publishes renderer output without replacing source or storage views', () => {
		const registry = new MaterialResourceRegistry();
		const sampledView = textureView('sampled');
		const storageView = textureView('storage');
		const publishedView = textureView('compute-output');
		const resource = registry.registerTexture({
			logicalId: 'velocity',
			ownedTexture: {} as GPUTexture,
			storageView,
			sampledView,
			format: 'rgba16float',
			mipLevelCount: 1,
			sampleType: 'float',
			usage: 3 as GPUTextureUsageFlags
		});

		expect(registry.publishTextureView('velocity', publishedView)).toBe(true);
		expect(resource.sampledView).toBe(sampledView);
		expect(resource.storageView).toBe(storageView);
		expect(resource.publishedView).toBe(publishedView);
		expect(resource.resourceVersion).toBe(1);
		expect(registry.publishTextureView('velocity', publishedView)).toBe(false);
		expect(resource.resourceVersion).toBe(1);
	});

	it('registers buffer identity and complete binding metadata', () => {
		const registry = new MaterialResourceRegistry();
		const buffer = {} as GPUBuffer;
		const resource = registry.registerStorageBuffer({
			logicalId: 'particles',
			buffer,
			size: 4096,
			wgslType: 'array<vec4f>',
			access: 'read-write',
			usage: 7 as GPUBufferUsageFlags
		});

		expect(resource).toEqual({
			logicalId: 'particles',
			buffer,
			size: 4096,
			wgslType: 'array<vec4f>',
			access: 'read-write',
			usage: 7,
			resourceVersion: 0
		});
		expect(registry.getStorageBuffer('particles')).toBe(resource);
	});

	it('advances logical resource versions for normal and ping-pong compute writes', () => {
		const registry = new MaterialResourceRegistry();
		const initialView = textureView('initial');
		const latestView = textureView('latest');
		const texture = registry.registerTexture({
			logicalId: 'velocity',
			sampledView: initialView,
			format: 'rgba16float',
			mipLevelCount: 1,
			sampleType: 'float',
			usage: 3 as GPUTextureUsageFlags
		});
		const buffer = registry.registerStorageBuffer({
			logicalId: 'particles',
			buffer: {} as GPUBuffer,
			size: 64,
			wgslType: 'array<f32>',
			access: 'read-write',
			usage: 1 as GPUBufferUsageFlags
		});

		expect(registry.markTextureWritten('velocity')).toBe(false);
		expect(texture.resourceVersion).toBe(1);
		expect(registry.markTextureWritten('velocity', latestView)).toBe(true);
		expect(texture.publishedView).toBe(latestView);
		expect(texture.resourceVersion).toBe(2);
		registry.markStorageBufferWritten('particles');
		expect(buffer.resourceVersion).toBe(1);
	});

	it('rejects duplicate resources and reports required lookup failures', () => {
		const registry = new MaterialResourceRegistry();
		const input = {
			logicalId: 'camera',
			sampledView: textureView('fallback'),
			format: 'rgba8unorm' as GPUTextureFormat,
			mipLevelCount: 1,
			sampleType: 'float' as GPUTextureSampleType,
			usage: 1 as GPUTextureUsageFlags
		};
		registry.registerTexture(input);
		expect(() => registry.registerTexture(input)).toThrow(/already registered/);
		expect(() => registry.requireTexture('missing')).toThrow(
			/Unknown material texture resource "missing"/
		);
		expect(() => registry.requireStorageBuffer('missing')).toThrow(
			/Unknown material storage buffer resource "missing"/
		);
	});

	it('clears metadata without destroying borrowed WebGPU objects', () => {
		const registry = new MaterialResourceRegistry();
		registry.registerTexture({
			logicalId: 'camera',
			sampledView: textureView('fallback'),
			format: 'rgba8unorm',
			mipLevelCount: 1,
			sampleType: 'float',
			usage: 1 as GPUTextureUsageFlags
		});
		registry.registerStorageBuffer({
			logicalId: 'data',
			buffer: {} as GPUBuffer,
			size: 16,
			wgslType: 'array<f32>',
			access: 'read',
			usage: 1 as GPUBufferUsageFlags
		});

		registry.clear();
		expect(registry.getTexture('camera')).toBeUndefined();
		expect(registry.getStorageBuffer('data')).toBeUndefined();
	});
});
