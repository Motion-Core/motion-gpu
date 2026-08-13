import { describe, expect, it } from 'vitest';
import {
	assertComputeContract,
	buildComputeResourceBindings,
	buildComputeShaderSource,
	buildComputeShaderSourceWithMap,
	extractWorkgroupSize,
	storageTextureSampleScalarType,
	type ResolvedComputeShaderBinding
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
	it('accepts 1D, 2D and 3D workgroup declarations', () => {
		expect(() => assertComputeContract(validComputeShader)).not.toThrow();
		expect(() => assertComputeContract(validComputeShader2D)).not.toThrow();
		expect(() => assertComputeContract(validComputeShader3D)).not.toThrow();
		expect(extractWorkgroupSize(validComputeShader)).toEqual([256, 1, 1]);
		expect(extractWorkgroupSize(validComputeShader2D)).toEqual([16, 16, 1]);
		expect(extractWorkgroupSize(validComputeShader3D)).toEqual([4, 4, 4]);
	});

	it.each([
		['@workgroup_size(1) fn compute(@builtin(global_invocation_id) id: vec3u) {}', /@compute/],
		['@compute fn compute(@builtin(global_invocation_id) id: vec3u) {}', /workgroup_size/],
		['@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) {}', /compute/],
		['@compute @workgroup_size(1) fn compute(id: vec3u) {}', /global_invocation_id/]
	])('rejects an invalid entrypoint contract', (source, message) => {
		expect(() => assertComputeContract(source)).toThrow(message);
	});

	it('checks that global_invocation_id belongs to the compute entrypoint', () => {
		const source = `
fn helper(@builtin(global_invocation_id) id: vec3u) {}
@compute @workgroup_size(8, 8)
fn compute() {}
`;
		expect(() => assertComputeContract(source)).toThrow(/global_invocation_id/);

		const prefixedHelper = `
fn computeHelper(@builtin(global_invocation_id) id: vec3u) {}
@compute @workgroup_size(8, 8)
fn compute() {}
`;
		expect(() => assertComputeContract(prefixedHelper)).toThrow(/global_invocation_id/);
	});

	it('accepts a newline between the compute function keyword and name', () => {
		const source = `
@compute @workgroup_size(8, 8)
fn
compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		expect(() => assertComputeContract(source)).not.toThrow();
	});

	it('rejects repeated incomplete entrypoint prefixes in bounded time', () => {
		const source = '@compute @workgroup_size('.repeat(10_000);
		expect(() => assertComputeContract(source)).toThrow(/workgroup_size/i);
	}, 250);

	it('rejects zero and oversized workgroup dimensions', () => {
		for (const size of [0, 65_536]) {
			const source = `@compute @workgroup_size(${size}) fn compute(@builtin(global_invocation_id) id: vec3u) {}`;
			expect(() => assertComputeContract(source)).toThrow(/workgroup_size/i);
			expect(() => extractWorkgroupSize(source)).toThrow(/workgroup_size/i);
		}
	});
});

describe('resolved compute shader source generation', () => {
	const resources: readonly ResolvedComputeShaderBinding[] = [
		{
			kind: 'storage-buffer',
			alias: 'forces',
			binding: 0,
			access: 'storage-read',
			wgslType: 'array<vec4f>'
		},
		{
			kind: 'sampler',
			alias: 'linearSampler',
			binding: 1,
			samplerType: 'filtering'
		},
		{
			kind: 'storage-buffer',
			alias: 'particlesOut',
			binding: 2,
			access: 'storage-read-write',
			wgslType: 'array<vec4f>'
		},
		{
			kind: 'sampled-texture',
			alias: 'velocityIn',
			binding: 3,
			scalarType: 'u32'
		},
		{
			kind: 'storage-texture',
			alias: 'velocityOut',
			binding: 4,
			format: 'rgba16float'
		}
	];

	it('emits one heterogeneous group 1 in resolver binding order', () => {
		const bindings = buildComputeResourceBindings(resources);
		expect(bindings.split('\n')).toEqual([
			'@group(1) @binding(0) var<storage, read> forces: array<vec4f>;',
			'@group(1) @binding(1) var linearSampler: sampler;',
			'@group(1) @binding(2) var<storage, read_write> particlesOut: array<vec4f>;',
			'@group(1) @binding(3) var velocityIn: texture_2d<u32>;',
			'@group(1) @binding(4) var velocityOut: texture_storage_2d<rgba16float, write>;'
		]);
		expect(bindings).not.toContain('@group(2)');
	});

	it('uses the same builder for ping-pong aliases and additional resources', () => {
		const bindings = buildComputeResourceBindings([
			{ kind: 'sampled-texture', alias: 'previous', binding: 0, scalarType: 'f32' },
			{ kind: 'sampler', alias: 'nearest', binding: 1, samplerType: 'non-filtering' },
			{
				kind: 'storage-texture',
				alias: 'next',
				binding: 2,
				format: 'rgba16float'
			}
		]);
		expect(bindings).toContain('@binding(0) var previous: texture_2d<f32>');
		expect(bindings).toContain('@binding(1) var nearest: sampler');
		expect(bindings).toContain('@binding(2) var next: texture_storage_2d<rgba16float, write>');
	});

	it('emits comparison sampler syntax for a fully resolved binding', () => {
		expect(
			buildComputeResourceBindings([
				{ kind: 'sampler', alias: 'shadowSampler', binding: 0, samplerType: 'comparison' }
			])
		).toContain('var shadowSampler: sampler_comparison;');
	});

	it('rejects non-contiguous resolver binding order instead of silently omitting entries', () => {
		expect(() =>
			buildComputeResourceBindings([
				{ kind: 'sampled-texture', alias: 'input', binding: 1, scalarType: 'f32' }
			])
		).toThrow(/expected binding 0/);
	});

	it('injects uniform structs and omits group 1 for an empty resource list', () => {
		const source = buildComputeShaderSource({
			compute: validComputeShader,
			uniformLayout: resolveUniformLayout({ uTime: 0 }),
			resources: []
		});
		expect(source).toContain('struct MotionGPUFrame');
		expect(source).toContain('uTime: f32');
		expect(source).toContain('@group(0) @binding(1) var<uniform> motiongpuUniforms');
		expect(source).not.toContain('@group(1)');
	});

	it('builds line mappings after the complete heterogeneous preamble', () => {
		const built = buildComputeShaderSourceWithMap({
			compute: validComputeShader2D,
			uniformLayout: resolveUniformLayout({ uDt: 0.016 }),
			resources
		});
		const mapped = built.lineMap.filter((entry) => entry?.kind === 'compute');
		expect(mapped).toHaveLength(validComputeShader2D.split('\n').length);
		expect(mapped[0]).toEqual({ kind: 'compute', line: 1 });
		expect(mapped.at(-1)).toEqual({
			kind: 'compute',
			line: validComputeShader2D.split('\n').length
		});
	});

	it('maps storage formats to sampled scalar types', () => {
		expect(storageTextureSampleScalarType('rgba8unorm')).toBe('f32');
		expect(storageTextureSampleScalarType('r32uint')).toBe('u32');
		expect(storageTextureSampleScalarType('rgba16sint')).toBe('i32');
	});
});
