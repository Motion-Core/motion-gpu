import { describe, expect, it, vi } from 'vitest';
import { createFrameRegistry } from '../../lib/core/frame-registry';
import type { FrameState, StorageBufferDefinitionMap } from '../../lib/core/types';

function createState(registry: ReturnType<typeof createFrameRegistry>, delta = 0.016): FrameState {
	return {
		time: 1,
		delta,
		setUniform: vi.fn(),
		setTexture: vi.fn(),
		writeStorageBuffer: vi.fn(),
		readStorageBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
		invalidate: registry.invalidate,
		advance: registry.advance,
		renderMode: registry.getRenderMode(),
		autoRender: registry.getAutoRender(),
		canvas: document.createElement('canvas')
	};
}

describe('FrameState storage operations', () => {
	it('FrameState includes writeStorageBuffer method', () => {
		const registry = createFrameRegistry();
		const state = createState(registry);

		expect(typeof state.writeStorageBuffer).toBe('function');
	});

	it('FrameState includes readStorageBuffer method', () => {
		const registry = createFrameRegistry();
		const state = createState(registry);

		expect(typeof state.readStorageBuffer).toBe('function');
	});

	it('writeStorageBuffer accepts ArrayBufferView and optional offset', () => {
		const registry = createFrameRegistry();
		const state = createState(registry);
		const data = new Float32Array([1, 2, 3, 4]);

		state.writeStorageBuffer('particles', data);
		expect(state.writeStorageBuffer).toHaveBeenCalledWith('particles', data);

		state.writeStorageBuffer('particles', data, { offset: 16 });
		expect(state.writeStorageBuffer).toHaveBeenCalledWith('particles', data, { offset: 16 });
	});

	it('readStorageBuffer returns a promise', async () => {
		const registry = createFrameRegistry();
		const state = createState(registry);

		const result = state.readStorageBuffer('particles');
		expect(result).toBeInstanceOf(Promise);

		const buffer = await result;
		expect(buffer).toBeInstanceOf(ArrayBuffer);
	});

	it('StorageBufferDefinitionMap type accepts valid buffer definitions', () => {
		const definitions: StorageBufferDefinitionMap<'particles' | 'velocities'> = {
			particles: { size: 1024, type: 'array<vec4f>' },
			velocities: { size: 512, type: 'array<vec4f>', access: 'read-write' }
		};

		expect(definitions.particles.size).toBe(1024);
		expect(definitions.velocities.type).toBe('array<vec4f>');
		expect(definitions.velocities.access).toBe('read-write');
	});

	it('StorageBufferDefinition accepts initialData', () => {
		const initialData = new Float32Array(256);
		const definitions: StorageBufferDefinitionMap = {
			data: {
				size: 1024,
				type: 'array<f32>',
				initialData
			}
		};

		expect(definitions.data!.initialData).toBe(initialData);
	});

	it('FrameState storage methods are callable in frame callback context', () => {
		const registry = createFrameRegistry();
		const callback = vi.fn((state: FrameState) => {
			state.writeStorageBuffer('buf', new Float32Array([1, 2]));
			void state.readStorageBuffer('buf');
		});

		registry.register(callback);
		const state = createState(registry);
		registry.run(state);

		expect(callback).toHaveBeenCalledTimes(1);
	});
});
