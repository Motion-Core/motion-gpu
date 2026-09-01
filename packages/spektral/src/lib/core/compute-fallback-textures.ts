export type ComputeSampledFallbackClass = 'float' | 'unfilterable-float' | 'uint' | 'sint';

export interface ComputeSampledFallbackTexture {
	readonly sampleType: ComputeSampledFallbackClass;
	readonly format: GPUTextureFormat;
	readonly texture: GPUTexture;
	readonly view: GPUTextureView;
}

interface FallbackDefinition {
	format: GPUTextureFormat;
	pixel: GPUAllowSharedBufferSource;
}

export function toComputeSampledFallbackClass(
	sampleType: GPUTextureSampleType
): ComputeSampledFallbackClass {
	if (sampleType === 'depth') {
		throw new Error('Depth textures are not supported as compute sampled resources.');
	}
	return sampleType;
}

function getFallbackDefinition(sampleType: ComputeSampledFallbackClass): FallbackDefinition {
	switch (sampleType) {
		case 'float':
			return { format: 'rgba8unorm', pixel: new Uint8Array([255, 255, 255, 255]) };
		case 'unfilterable-float':
			return { format: 'r32float', pixel: new Float32Array([1]) };
		case 'uint':
			return { format: 'r32uint', pixel: new Uint32Array([1]) };
		case 'sint':
			return { format: 'r32sint', pixel: new Int32Array([1]) };
		default:
			throw new Error(`Unsupported compute sampled fallback class: ${sampleType satisfies never}`);
	}
}

/**
 * Device-local, lazily allocated fallback views for every compute sample class.
 */
export class ComputeSampledFallbackTexturePool {
	private readonly entries = new Map<ComputeSampledFallbackClass, ComputeSampledFallbackTexture>();
	private disposed = false;

	constructor(private readonly device: GPUDevice) {}

	get(sampleType: ComputeSampledFallbackClass): ComputeSampledFallbackTexture {
		if (this.disposed) {
			throw new Error('Compute sampled fallback texture pool has been disposed.');
		}
		const cached = this.entries.get(sampleType);
		if (cached) return cached;

		const definition = getFallbackDefinition(sampleType);
		const texture = this.device.createTexture({
			label: `spektral:fallback:${sampleType}`,
			size: { width: 1, height: 1, depthOrArrayLayers: 1 },
			format: definition.format,
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
		});
		try {
			this.device.queue.writeTexture(
				{ texture },
				definition.pixel,
				{ offset: 0, bytesPerRow: 4, rowsPerImage: 1 },
				{ width: 1, height: 1, depthOrArrayLayers: 1 }
			);
			const entry = Object.freeze({
				sampleType,
				format: definition.format,
				texture,
				view: texture.createView({ dimension: '2d' })
			});
			this.entries.set(sampleType, entry);
			return entry;
		} catch (error) {
			texture.destroy();
			throw error;
		}
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const entry of this.entries.values()) {
			entry.texture.destroy();
		}
		this.entries.clear();
	}
}
