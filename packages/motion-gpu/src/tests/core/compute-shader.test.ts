import { describe, expect, it } from 'vitest';
import {
	assertComputeContract,
	buildComputeShaderSource,
	buildComputeStorageBufferBindings,
	buildComputeStorageTextureBindings,
	buildPingPongComputeShaderSource,
	storageTextureSampleScalarType,
	extractWorkgroupSize
} from '../../lib/core/compute-shader';
import { resolveUniformLayout } from '../../lib/core/uniforms';

const validComputeShader = `
@compute @workgroup_size(256)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let index = id.x;
}
`;

const validComputeShader2D = `
@compute @workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
	let y = id.y;
}
`;

const validComputeShader3D = `
@compute @workgroup_size(4, 4, 4)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
}
`;

describe('compute shader contract', () => {
	it('accepts valid @compute @workgroup_size(256) fn compute(...)', () => {
		expect(() => assertComputeContract(validComputeShader)).not.toThrow();
	});

	it('accepts multi-dim @workgroup_size(16, 16)', () => {
		expect(() => assertComputeContract(validComputeShader2D)).not.toThrow();
	});

	it('accepts 3D @workgroup_size(4, 4, 4)', () => {
		expect(() => assertComputeContract(validComputeShader3D)).not.toThrow();
	});

	it('rejects missing @compute annotation', () => {
		const bad = `
@workgroup_size(256)
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		expect(() => assertComputeContract(bad)).toThrow(/@compute/);
	});

	it('rejects missing @workgroup_size', () => {
		const bad = `
@compute
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		expect(() => assertComputeContract(bad)).toThrow(/@workgroup_size/);
	});

	it('rejects fn named "main" instead of "compute"', () => {
		const bad = `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {}
`;
		expect(() => assertComputeContract(bad)).toThrow(/compute/);
	});

	it('rejects missing @builtin(global_invocation_id) parameter', () => {
		const bad = `
@compute @workgroup_size(256)
fn compute(id: vec3u) {}
`;
		expect(() => assertComputeContract(bad)).toThrow(/global_invocation_id/);
	});

	it('extracts workgroup size [256, 1, 1] from 1D', () => {
		expect(extractWorkgroupSize(validComputeShader)).toEqual([256, 1, 1]);
	});

	it('extracts workgroup size [16, 16, 1] from 2D', () => {
		expect(extractWorkgroupSize(validComputeShader2D)).toEqual([16, 16, 1]);
	});

	it('extracts workgroup size [4, 4, 4] from 3D', () => {
		expect(extractWorkgroupSize(validComputeShader3D)).toEqual([4, 4, 4]);
	});
});

describe('compute shader source generation', () => {
	it('injects MotionGPUFrame and MotionGPUUniforms structs', () => {
		const source = buildComputeShaderSource({
			compute: validComputeShader,
			uniformLayout: resolveUniformLayout({ uTime: 0 }),
			storageBufferKeys: [],
			storageBufferDefinitions: {},
			storageTextureKeys: [],
			storageTextureDefinitions: {}
		});

		expect(source).toContain('struct MotionGPUFrame');
		expect(source).toContain('struct MotionGPUUniforms');
		expect(source).toContain('uTime: f32');
		expect(source).toContain('@group(0) @binding(0) var<uniform> motiongpuFrame');
		expect(source).toContain('@group(0) @binding(1) var<uniform> motiongpuUniforms');
	});

	it('generates storage buffer bindings on group(1)', () => {
		const bindings = buildComputeStorageBufferBindings(
			['particles', 'velocities'],
			{
				particles: { type: 'array<vec4f>', access: 'read-write' },
				velocities: { type: 'array<vec4f>', access: 'read' }
			},
			1
		);

		expect(bindings).toContain(
			'@group(1) @binding(0) var<storage, read_write> particles: array<vec4f>;'
		);
		expect(bindings).toContain(
			'@group(1) @binding(1) var<storage, read> velocities: array<vec4f>;'
		);
	});

	it('generates storage texture bindings on group(2)', () => {
		const bindings = buildComputeStorageTextureBindings(
			['outputTex'],
			{ outputTex: { format: 'rgba8unorm' } },
			2
		);

		expect(bindings).toContain(
			'@group(2) @binding(0) var outputTex: texture_storage_2d<rgba8unorm, write>;'
		);
	});

	it('respects access mode (read vs read_write) in var declaration', () => {
		const bindings = buildComputeStorageBufferBindings(
			['readBuf', 'rwBuf'],
			{
				readBuf: { type: 'array<f32>', access: 'read' },
				rwBuf: { type: 'array<u32>', access: 'read-write' }
			},
			1
		);

		expect(bindings).toContain('var<storage, read> readBuf');
		expect(bindings).toContain('var<storage, read_write> rwBuf');
	});

	it('uses correct format in texture_storage_2d<format, write>', () => {
		const bindings = buildComputeStorageTextureBindings(
			['hdrTex'],
			{ hdrTex: { format: 'rgba32float' } },
			2
		);
		expect(bindings).toContain('texture_storage_2d<rgba32float, write>');
	});

	it('handles empty storage buffers/textures', () => {
		const source = buildComputeShaderSource({
			compute: validComputeShader,
			uniformLayout: resolveUniformLayout({}),
			storageBufferKeys: [],
			storageBufferDefinitions: {},
			storageTextureKeys: [],
			storageTextureDefinitions: {}
		});

		expect(source).toContain('struct MotionGPUFrame');
		expect(source).toContain('fn compute(@builtin(global_invocation_id)');
		expect(source).not.toContain('@group(1)');
		expect(source).not.toContain('@group(2)');
	});

	it('snapshot: full compute shader with uniforms + buffers + textures', () => {
		const source = buildComputeShaderSource({
			compute: validComputeShader2D,
			uniformLayout: resolveUniformLayout({ uDt: 0.016, uGravity: [0, -9.8, 0] }),
			storageBufferKeys: ['particles', 'velocities'],
			storageBufferDefinitions: {
				particles: { type: 'array<vec4f>', access: 'read-write' },
				velocities: { type: 'array<vec4f>', access: 'read' }
			},
			storageTextureKeys: ['outputTex'],
			storageTextureDefinitions: {
				outputTex: { format: 'rgba8unorm' }
			}
		});

		expect(source).toMatchSnapshot();
	});

	it('builds ping-pong shader bindings for targetA/targetB', () => {
		const source = buildPingPongComputeShaderSource({
			compute: validComputeShader2D,
			uniformLayout: resolveUniformLayout({ uDt: 0.016 }),
			storageBufferKeys: ['particles'],
			storageBufferDefinitions: {
				particles: { type: 'array<vec4f>', access: 'read-write' }
			},
			target: 'sim',
			targetFormat: 'rgba16float'
		});

		expect(source).toContain('@group(2) @binding(0) var simA: texture_2d<f32>;');
		expect(source).toContain(
			'@group(2) @binding(1) var simB: texture_storage_2d<rgba16float, write>;'
		);
		expect(source).toContain(
			'@group(1) @binding(0) var<storage, read_write> particles: array<vec4f>;'
		);
	});

	it('maps storage format to sampled scalar type for ping-pong read binding', () => {
		expect(storageTextureSampleScalarType('rgba8unorm')).toBe('f32');
		expect(storageTextureSampleScalarType('r32uint')).toBe('u32');
		expect(storageTextureSampleScalarType('rgba16sint')).toBe('i32');
	});
});
