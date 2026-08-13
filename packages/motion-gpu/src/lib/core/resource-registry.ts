import { createMotionGPUError } from './error-report.js';
import type { StorageBufferAccess, StorageBufferType } from './types.js';

/**
 * Logical material texture and its current renderer-owned physical state.
 */
export interface RuntimeTextureResource {
	readonly logicalId: string;
	ownedTexture: GPUTexture | null;
	storageView: GPUTextureView | null;
	sampledView: GPUTextureView;
	publishedView: GPUTextureView;
	format: GPUTextureFormat;
	width: number | undefined;
	height: number | undefined;
	mipLevelCount: number;
	sampleType: GPUTextureSampleType;
	usage: GPUTextureUsageFlags;
	resourceVersion: number;
}

/**
 * Logical material storage buffer and its renderer-owned physical allocation.
 */
export interface RuntimeStorageBufferResource {
	readonly logicalId: string;
	readonly buffer: GPUBuffer;
	readonly size: number;
	readonly wgslType: StorageBufferType;
	readonly access: StorageBufferAccess;
	readonly usage: GPUBufferUsageFlags;
	resourceVersion: number;
}

export interface RuntimeTextureResourceInput {
	logicalId: string;
	ownedTexture?: GPUTexture | null;
	storageView?: GPUTextureView | null;
	sampledView: GPUTextureView;
	publishedView?: GPUTextureView;
	format: GPUTextureFormat;
	width?: number;
	height?: number;
	mipLevelCount: number;
	sampleType: GPUTextureSampleType;
	usage: GPUTextureUsageFlags;
}

export interface RuntimeTextureAllocation {
	ownedTexture: GPUTexture | null;
	storageView: GPUTextureView | null;
	sampledView: GPUTextureView;
	format: GPUTextureFormat;
	width: number | undefined;
	height: number | undefined;
	mipLevelCount: number;
	usage: GPUTextureUsageFlags;
}

function assertUniqueResource(
	kind: 'texture' | 'storage buffer',
	logicalId: string,
	resources: ReadonlyMap<string, unknown>
): void {
	if (resources.has(logicalId)) {
		throw createMotionGPUError(
			'RESOURCE_REGISTRY_DUPLICATE',
			`Material ${kind} resource "${logicalId}" is already registered.`
		);
	}
}

/**
 * Renderer-local registry of logical material resources.
 *
 * The registry owns metadata, not WebGPU objects. The renderer remains
 * responsible for destroying allocations in its lifecycle teardown.
 */
export class MaterialResourceRegistry {
	private readonly textures = new Map<string, RuntimeTextureResource>();
	private readonly buffers = new Map<string, RuntimeStorageBufferResource>();

	registerTexture(input: RuntimeTextureResourceInput): RuntimeTextureResource {
		assertUniqueResource('texture', input.logicalId, this.textures);
		const resource: RuntimeTextureResource = {
			logicalId: input.logicalId,
			ownedTexture: input.ownedTexture ?? null,
			storageView: input.storageView ?? null,
			sampledView: input.sampledView,
			publishedView: input.publishedView ?? input.sampledView,
			format: input.format,
			width: input.width,
			height: input.height,
			mipLevelCount: input.mipLevelCount,
			sampleType: input.sampleType,
			usage: input.usage,
			resourceVersion: 0
		};
		this.textures.set(input.logicalId, resource);
		return resource;
	}

	registerStorageBuffer(
		input: Omit<RuntimeStorageBufferResource, 'resourceVersion'>
	): RuntimeStorageBufferResource {
		assertUniqueResource('storage buffer', input.logicalId, this.buffers);
		const resource: RuntimeStorageBufferResource = {
			...input,
			resourceVersion: 0
		};
		this.buffers.set(input.logicalId, resource);
		return resource;
	}

	getTexture(logicalId: string): RuntimeTextureResource | undefined {
		return this.textures.get(logicalId);
	}

	requireTexture(logicalId: string): RuntimeTextureResource {
		const resource = this.getTexture(logicalId);
		if (!resource) {
			throw createMotionGPUError(
				'RESOURCE_REGISTRY_TEXTURE_MISSING',
				`Unknown material texture resource "${logicalId}".`
			);
		}
		return resource;
	}

	getStorageBuffer(logicalId: string): RuntimeStorageBufferResource | undefined {
		return this.buffers.get(logicalId);
	}

	requireStorageBuffer(logicalId: string): RuntimeStorageBufferResource {
		const resource = this.getStorageBuffer(logicalId);
		if (!resource) {
			throw createMotionGPUError(
				'RESOURCE_REGISTRY_STORAGE_BUFFER_MISSING',
				`Unknown material storage buffer resource "${logicalId}".`
			);
		}
		return resource;
	}

	/**
	 * Replaces physical texture state and publishes the sampled view atomically.
	 * Returns whether fragment/consumer bind groups need a new view reference.
	 */
	replaceTextureAllocation(logicalId: string, next: RuntimeTextureAllocation): boolean {
		const resource = this.requireTexture(logicalId);
		const publishedViewChanged = resource.publishedView !== next.sampledView;
		const allocationChanged =
			resource.ownedTexture !== next.ownedTexture ||
			resource.storageView !== next.storageView ||
			resource.sampledView !== next.sampledView ||
			resource.format !== next.format ||
			resource.width !== next.width ||
			resource.height !== next.height ||
			resource.mipLevelCount !== next.mipLevelCount ||
			resource.usage !== next.usage;

		resource.ownedTexture = next.ownedTexture;
		resource.storageView = next.storageView;
		resource.sampledView = next.sampledView;
		resource.publishedView = next.sampledView;
		resource.format = next.format;
		resource.width = next.width;
		resource.height = next.height;
		resource.mipLevelCount = next.mipLevelCount;
		resource.usage = next.usage;
		if (allocationChanged || publishedViewChanged) {
			resource.resourceVersion += 1;
		}
		return publishedViewChanged;
	}

	/**
	 * Publishes a renderer-produced view without changing the source allocation.
	 */
	publishTextureView(logicalId: string, view: GPUTextureView): boolean {
		const resource = this.requireTexture(logicalId);
		if (resource.publishedView === view) {
			return false;
		}
		resource.publishedView = view;
		resource.resourceVersion += 1;
		return true;
	}

	markTextureWritten(logicalId: string, publishedView?: GPUTextureView): boolean {
		const resource = this.requireTexture(logicalId);
		const publishedViewChanged =
			publishedView !== undefined && resource.publishedView !== publishedView;
		if (publishedView !== undefined) {
			resource.publishedView = publishedView;
		}
		resource.resourceVersion += 1;
		return publishedViewChanged;
	}

	markStorageBufferWritten(logicalId: string): void {
		this.requireStorageBuffer(logicalId).resourceVersion += 1;
	}

	clear(): void {
		this.textures.clear();
		this.buffers.clear();
	}
}
