import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ComputeSampledFallbackTexturePool,
	toComputeSampledFallbackClass
} from '../../lib/core/compute-fallback-textures';

function createDevice() {
	const textures: Array<{
		descriptor: GPUTextureDescriptor;
		destroy: ReturnType<typeof vi.fn>;
		view: GPUTextureView;
	}> = [];
	const device = {
		queue: { writeTexture: vi.fn() },
		createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
			const record = {
				descriptor,
				destroy: vi.fn(),
				view: { descriptor } as unknown as GPUTextureView
			};
			textures.push(record);
			return {
				destroy: record.destroy,
				createView: vi.fn(() => record.view)
			} as unknown as GPUTexture;
		})
	} as unknown as GPUDevice;
	return { device, textures };
}

describe('ComputeSampledFallbackTexturePool', () => {
	beforeEach(() => {
		Reflect.set(globalThis, 'GPUTextureUsage', { TEXTURE_BINDING: 4, COPY_DST: 2 });
	});

	it.each([
		['float', 'rgba8unorm', Uint8Array],
		['unfilterable-float', 'r32float', Float32Array],
		['uint', 'r32uint', Uint32Array],
		['sint', 'r32sint', Int32Array]
	] as const)('allocates a typed %s fallback using %s', (sampleType, format, PixelArray) => {
		const { device, textures } = createDevice();
		const pool = new ComputeSampledFallbackTexturePool(device);
		const entry = pool.get(sampleType);

		expect(entry).toMatchObject({ sampleType, format });
		expect(textures[0]?.descriptor).toMatchObject({
			label: `motiongpu:fallback:${sampleType}`,
			size: { width: 1, height: 1, depthOrArrayLayers: 1 },
			format,
			usage: 6
		});
		const write = (device.queue.writeTexture as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(write?.[1]).toBeInstanceOf(PixelArray);
		expect(write?.[2]).toEqual({ offset: 0, bytesPerRow: 4, rowsPerImage: 1 });
	});

	it('maps WebGPU sampled texture classes and rejects depth resources', () => {
		expect(toComputeSampledFallbackClass('float')).toBe('float');
		expect(toComputeSampledFallbackClass('unfilterable-float')).toBe('unfilterable-float');
		expect(toComputeSampledFallbackClass('uint')).toBe('uint');
		expect(toComputeSampledFallbackClass('sint')).toBe('sint');
		expect(() => toComputeSampledFallbackClass('depth')).toThrow(/Depth textures/);
	});

	it('shares one allocation per sample class', () => {
		const { device, textures } = createDevice();
		const pool = new ComputeSampledFallbackTexturePool(device);
		expect(pool.get('float')).toBe(pool.get('float'));
		expect(textures).toHaveLength(1);
	});

	it('destroys every allocation exactly once and rejects use after disposal', () => {
		const { device, textures } = createDevice();
		const pool = new ComputeSampledFallbackTexturePool(device);
		pool.get('float');
		pool.get('uint');
		pool.destroy();
		pool.destroy();

		expect(textures).toHaveLength(2);
		for (const record of textures) {
			expect(record.destroy).toHaveBeenCalledTimes(1);
		}
		expect(() => pool.get('float')).toThrow(/has been disposed/);
	});

	it('destroys a partially created texture when initialization fails', () => {
		const { device, textures } = createDevice();
		(device.queue.writeTexture as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
			throw new Error('write failed');
		});
		const pool = new ComputeSampledFallbackTexturePool(device);
		expect(() => pool.get('sint')).toThrow(/write failed/);
		expect(textures[0]?.destroy).toHaveBeenCalledTimes(1);
	});
});
