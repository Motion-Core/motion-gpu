import { describe, expect, it } from 'vitest';
import type {
	StorageBufferAccess,
	StorageBufferDefinition,
	StorageBufferDefinitionMap,
	StorageBufferType,
	ComputePassContext,
	TextureDefinition
} from '../../lib/core/types';

function assertType<T>(value: T): void {
	void value;
	// compile-time only
}

describe('compute types', () => {
	it('StorageBufferDefinition accepts valid size/type/access combinations', () => {
		const definition: StorageBufferDefinition = {
			size: 1024,
			type: 'array<vec4f>',
			access: 'read-write'
		};
		expect(definition.size).toBe(1024);
		expect(definition.type).toBe('array<vec4f>');
		expect(definition.access).toBe('read-write');
	});

	it('StorageBufferDefinition accepts optional initialData', () => {
		const definition: StorageBufferDefinition = {
			size: 64,
			type: 'array<f32>',
			initialData: new Float32Array(16)
		};
		expect(definition.initialData).toBeInstanceOf(Float32Array);
		expect(definition.initialData).toHaveLength(16);
	});

	it('StorageBufferDefinition accepts Uint32Array and Int32Array initialData', () => {
		const u32Def: StorageBufferDefinition = {
			size: 64,
			type: 'array<u32>',
			initialData: new Uint32Array(16)
		};
		const i32Def: StorageBufferDefinition = {
			size: 64,
			type: 'array<i32>',
			initialData: new Int32Array(16)
		};
		expect(u32Def.initialData).toBeInstanceOf(Uint32Array);
		expect(i32Def.initialData).toBeInstanceOf(Int32Array);
	});

	it('StorageBufferType covers all expected WGSL array types', () => {
		const allTypes: StorageBufferType[] = [
			'array<f32>',
			'array<vec2f>',
			'array<vec3f>',
			'array<vec4f>',
			'array<u32>',
			'array<i32>',
			'array<vec4u>',
			'array<vec4i>'
		];
		expect(allTypes).toHaveLength(8);
		for (const type of allTypes) {
			assertType<StorageBufferType>(type);
		}
	});

	it('StorageBufferAccess covers read, write, and read-write', () => {
		const allModes: StorageBufferAccess[] = ['read', 'read-write'];
		expect(allModes).toHaveLength(2);
		for (const mode of allModes) {
			assertType<StorageBufferAccess>(mode);
		}
	});

	it('StorageBufferDefinitionMap maps string keys to definitions', () => {
		const map: StorageBufferDefinitionMap = {
			particles: { size: 4096, type: 'array<vec4f>' },
			velocities: { size: 4096, type: 'array<vec4f>', access: 'read' }
		};
		expect(Object.keys(map)).toEqual(['particles', 'velocities']);
		expect(map['particles']?.size).toBe(4096);
	});

	it('TextureDefinition accepts storage flag with format', () => {
		const definition: TextureDefinition = {
			storage: true,
			format: 'rgba8unorm',
			fragmentVisible: true
		};
		expect(definition.storage).toBe(true);
		expect(definition.format).toBe('rgba8unorm');
		expect(definition.fragmentVisible).toBe(true);
	});

	it('TextureDefinition storage defaults are compatible with existing definitions', () => {
		const legacy: TextureDefinition = {
			source: null,
			colorSpace: 'srgb',
			filter: 'linear'
		};
		expect(legacy.storage).toBeUndefined();
		expect(legacy.format).toBeUndefined();
		expect(legacy.fragmentVisible).toBeUndefined();
	});

	it('ComputePassContext includes all required fields', () => {
		const ctx: ComputePassContext = {
			device: {} as GPUDevice,
			commandEncoder: {} as GPUCommandEncoder,
			width: 1920,
			height: 1080,
			time: 1.5,
			delta: 0.016,
			beginComputePass: () => ({}) as GPUComputePassEncoder
		};
		expect(ctx.width).toBe(1920);
		expect(ctx.height).toBe(1080);
		expect(ctx.time).toBe(1.5);
		expect(ctx.delta).toBe(0.016);
		expect(typeof ctx.beginComputePass).toBe('function');
	});
});
