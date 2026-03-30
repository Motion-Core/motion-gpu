import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../../lib/core/renderer';
import { resolveUniformLayout } from '../../lib/core/uniforms';
import type { TextureDefinitionMap } from '../../lib/core/types';
import { normalizeTextureDefinition } from '../../lib/core/textures';
import {
	buildComputeStorageTextureBindings,
	buildComputeShaderSource
} from '../../lib/core/compute-shader';

// ── Mock WebGPU runtime ───────────────────────────────────────────────────────

type MockTexture = {
	descriptor: GPUTextureDescriptor;
	destroy: ReturnType<typeof vi.fn>;
	createView: ReturnType<typeof vi.fn>;
};

function createMockTexture(descriptor: GPUTextureDescriptor): MockTexture {
	return {
		descriptor,
		destroy: vi.fn(),
		createView: vi.fn(() => ({ textureDescriptor: descriptor }) as unknown as GPUTextureView)
	};
}

function createWebGpuRuntime() {
	let resolveDeviceLost: ((info: { reason?: string; message?: string }) => void) | null = null;
	const lost = new Promise<{ reason?: string; message?: string }>((resolve) => {
		resolveDeviceLost = resolve;
	});
	const textures: MockTexture[] = [];
	const buffers: Array<{ destroy: ReturnType<typeof vi.fn>; descriptor: GPUBufferDescriptor }> = [];
	const device = {
		queue: {
			writeTexture: vi.fn(),
			copyExternalImageToTexture: vi.fn(),
			writeBuffer: vi.fn(),
			submit: vi.fn()
		},
		createShaderModule: vi.fn(
			() =>
				({
					getCompilationInfo: vi.fn(async () => ({ messages: [] }))
				}) as unknown as GPUShaderModule
		),
		createSampler: vi.fn(() => ({}) as unknown as GPUSampler),
		createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
			const texture = createMockTexture(descriptor);
			textures.push(texture);
			return texture as unknown as GPUTexture;
		}),
		createBindGroupLayout: vi.fn(() => ({}) as unknown as GPUBindGroupLayout),
		createPipelineLayout: vi.fn(() => ({}) as unknown as GPUPipelineLayout),
		createRenderPipeline: vi.fn(() => ({}) as unknown as GPURenderPipeline),
		createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
			const buffer = { destroy: vi.fn(), descriptor };
			buffers.push(buffer);
			return buffer as unknown as GPUBuffer;
		}),
		createBindGroup: vi.fn(() => ({}) as unknown as GPUBindGroup),
		createComputePipeline: vi.fn(() => ({}) as unknown as GPUComputePipeline),
		createCommandEncoder: vi.fn(() => {
			const pass = {
				setPipeline: vi.fn(),
				setBindGroup: vi.fn(),
				draw: vi.fn(),
				end: vi.fn()
			};
			const computePass = {
				setPipeline: vi.fn(),
				setBindGroup: vi.fn(),
				dispatchWorkgroups: vi.fn(),
				end: vi.fn()
			};
			return {
				copyTextureToTexture: vi.fn(),
				copyBufferToBuffer: vi.fn(),
				beginRenderPass: vi.fn(() => pass as unknown as GPURenderPassEncoder),
				beginComputePass: vi.fn(() => computePass as unknown as GPUComputePassEncoder),
				finish: vi.fn(() => ({}) as unknown as GPUCommandBuffer)
			} as unknown as GPUCommandEncoder;
		}),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		lost
	};

	const adapterRequest = vi.fn(async () => ({
		requestDevice: vi.fn(async () => device as unknown as GPUDevice)
	}));

	const context = {
		configure: vi.fn(),
		getCurrentTexture: vi.fn(() => {
			const texture = createMockTexture({
				size: { width: 10, height: 10, depthOrArrayLayers: 1 },
				format: 'rgba8unorm',
				usage: GPUTextureUsage.RENDER_ATTACHMENT
			});
			textures.push(texture);
			return texture as unknown as GPUTexture;
		})
	};

	const canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => context),
		getBoundingClientRect: vi.fn(() => ({ width: 10, height: 10 }))
	} as unknown as HTMLCanvasElement;

	Reflect.set(globalThis, 'GPUShaderStage', { FRAGMENT: 0x10, COMPUTE: 0x20 });
	Reflect.set(globalThis, 'GPUTextureUsage', {
		TEXTURE_BINDING: 1,
		COPY_DST: 2,
		RENDER_ATTACHMENT: 4,
		COPY_SRC: 8,
		STORAGE_BINDING: 16
	});
	Reflect.set(globalThis, 'GPUBufferUsage', {
		UNIFORM: 1,
		COPY_DST: 2,
		COPY_SRC: 4,
		STORAGE: 128,
		MAP_READ: 256
	});
	Reflect.set(navigator, 'gpu', {
		getPreferredCanvasFormat: () => 'rgba8unorm',
		requestAdapter: adapterRequest
	});

	return {
		canvas,
		context,
		device,
		textures,
		buffers,
		resolveDeviceLost: (info: { reason?: string; message?: string }) => {
			resolveDeviceLost?.(info);
		}
	};
}

function baseOptions(
	runtime: ReturnType<typeof createWebGpuRuntime>,
	extra: Partial<Parameters<typeof createRenderer>[0]> = {}
) {
	return {
		canvas: runtime.canvas,
		fragmentWgsl: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
		uniformLayout: resolveUniformLayout({}),
		textureKeys: [],
		textureDefinitions: {} as TextureDefinitionMap,
		outputColorSpace: 'srgb' as const,
		getClearColor: () => [0, 0, 0, 1] as [number, number, number, number],
		getDpr: () => 1,
		fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
		includeSources: {},
		fragmentLineMap: [null],
		...extra
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('storage textures', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
		Reflect.deleteProperty(globalThis, 'GPUShaderStage');
		Reflect.deleteProperty(globalThis, 'GPUTextureUsage');
		Reflect.deleteProperty(globalThis, 'GPUBufferUsage');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	// ── Normalization ─────────────────────────────────────────────────────

	describe('normalizeTextureDefinition', () => {
		it('preserves explicit format for storage textures', () => {
			const norm = normalizeTextureDefinition({
				storage: true,
				format: 'rgba16float',
				width: 512,
				height: 512
			});
			expect(norm.format).toBe('rgba16float');
			expect(norm.storage).toBe(true);
			expect(norm.width).toBe(512);
			expect(norm.height).toBe(512);
		});

		it('defaults storage to false', () => {
			expect(normalizeTextureDefinition(undefined).storage).toBe(false);
			expect(normalizeTextureDefinition({}).storage).toBe(false);
		});

		it('omits width/height when not provided (exactOptionalPropertyTypes)', () => {
			const norm = normalizeTextureDefinition({});
			expect('width' in norm).toBe(false);
			expect('height' in norm).toBe(false);
		});

		it('propagates width/height when provided', () => {
			const norm = normalizeTextureDefinition({ width: 128, height: 64 });
			expect(norm.width).toBe(128);
			expect(norm.height).toBe(64);
		});
	});

	// ── WGSL generation ───────────────────────────────────────────────────

	describe('buildComputeStorageTextureBindings', () => {
		it('generates WGSL storage texture bindings', () => {
			const wgsl = buildComputeStorageTextureBindings(
				['densityMap'],
				{ densityMap: { format: 'rgba16float' as GPUTextureFormat } },
				2
			);
			expect(wgsl).toContain('@group(2) @binding(0)');
			expect(wgsl).toContain('var densityMap: texture_storage_2d<rgba16float, write>');
		});

		it('generates multiple bindings in sorted key order', () => {
			const wgsl = buildComputeStorageTextureBindings(
				['texA', 'texB'],
				{
					texA: { format: 'rgba8unorm' as GPUTextureFormat },
					texB: { format: 'r32float' as GPUTextureFormat }
				},
				2
			);
			expect(wgsl).toContain('@group(2) @binding(0) var texA');
			expect(wgsl).toContain('@group(2) @binding(1) var texB');
			expect(wgsl).toContain('texture_storage_2d<rgba8unorm, write>');
			expect(wgsl).toContain('texture_storage_2d<r32float, write>');
		});

		it('returns empty string when no storage texture keys', () => {
			expect(buildComputeStorageTextureBindings([], {}, 2)).toBe('');
		});
	});

	describe('buildComputeShaderSource', () => {
		it('includes storage texture bindings in full compute shader', () => {
			const source = buildComputeShaderSource({
				compute:
					'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}',
				uniformLayout: resolveUniformLayout({}),
				storageBufferKeys: [],
				storageBufferDefinitions: {},
				storageTextureKeys: ['densityMap'],
				storageTextureDefinitions: { densityMap: { format: 'rgba16float' as GPUTextureFormat } }
			});
			expect(source).toContain('texture_storage_2d<rgba16float, write>');
			expect(source).toContain('@group(2) @binding(0) var densityMap');
		});

		it('generates valid WGSL with both storage buffers and storage textures', () => {
			const source = buildComputeShaderSource({
				compute:
					'@compute @workgroup_size(256)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}',
				uniformLayout: resolveUniformLayout({ uTime: { type: 'f32', value: 0 } }),
				storageBufferKeys: ['particles'],
				storageBufferDefinitions: {
					particles: { type: 'array<f32>', access: 'read-write' }
				},
				storageTextureKeys: ['densityMap'],
				storageTextureDefinitions: { densityMap: { format: 'rgba16float' as GPUTextureFormat } }
			});

			// group(0) = uniforms
			expect(source).toContain('@group(0)');
			// group(1) = storage buffers
			expect(source).toContain('@group(1) @binding(0) var<storage, read_write> particles');
			// group(2) = storage textures
			expect(source).toContain('@group(2) @binding(0) var densityMap');
		});
	});

	// ── Renderer integration ──────────────────────────────────────────────

	describe('renderer: storage texture allocation', () => {
		it('creates storage textures with STORAGE_BINDING usage flag', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 256,
					height: 256
				}
			};

			await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity']
				})
			);

			// Find the storage texture (256x256)
			const storageTexture = runtime.textures.find(
				(t) =>
					t.descriptor.size &&
					typeof t.descriptor.size === 'object' &&
					'width' in t.descriptor.size &&
					t.descriptor.size.width === 256
			);
			expect(storageTexture).toBeDefined();
			expect(storageTexture!.descriptor.format).toBe('rgba16float');
			expect(storageTexture!.descriptor.usage).toBeDefined();

			// Verify STORAGE_BINDING flag is set
			const usage = storageTexture!.descriptor.usage!;
			expect(usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
			expect(usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
			expect(usage & GPUTextureUsage.COPY_DST).toBeTruthy();
		});

		it('creates storage texture view at initialization', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 128,
					height: 128
				}
			};

			await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity']
				})
			);

			// Storage texture should have createView called during init
			const storageTexture = runtime.textures.find(
				(t) =>
					t.descriptor.size &&
					typeof t.descriptor.size === 'object' &&
					'width' in t.descriptor.size &&
					t.descriptor.size.width === 128
			);
			expect(storageTexture).toBeDefined();
			expect(storageTexture!.createView).toHaveBeenCalled();
		});

		it('uses safe fallback format for storage textures to avoid writeTexture size mismatch', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 64,
					height: 64
				}
			};

			await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity']
				})
			);

			// The fallback texture (1x1) should use rgba8unorm, not rgba16float,
			// to avoid bytesPerRow mismatch in writeTexture (4 bytes vs 8 bytes).
			const fallbackTexture = runtime.textures.find(
				(t) =>
					t.descriptor.size &&
					typeof t.descriptor.size === 'object' &&
					'width' in t.descriptor.size &&
					t.descriptor.size.width === 1 &&
					t.descriptor.format === 'rgba8unorm'
			);
			expect(fallbackTexture).toBeDefined();

			// Should NOT have a 1x1 rgba16float fallback
			const badFallback = runtime.textures.find(
				(t) =>
					t.descriptor.size &&
					typeof t.descriptor.size === 'object' &&
					'width' in t.descriptor.size &&
					t.descriptor.size.width === 1 &&
					t.descriptor.format === 'rgba16float'
			);
			expect(badFallback).toBeUndefined();
		});

		it('fragment bind group references storage texture view, not fallback', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 64,
					height: 64
				}
			};

			await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity']
				})
			);

			// The fragment bind group (first createBindGroup call after pipeline creation)
			// should include the storage texture's view (64x64), not the fallback (1x1)
			const bindGroupCalls = runtime.device.createBindGroup.mock.calls;

			// Find the bind group call that includes texture entries
			// The fragment bind group has entries with sampler + texture view
			const fragmentBindGroupCall = bindGroupCalls.find((call: unknown[]) => {
				const arg = call[0] as { entries?: Array<{ resource?: unknown }> };
				return (
					arg.entries &&
					arg.entries.length > 2 && // frame + uniform + sampler + texture
					arg.entries.some(
						(e: { resource?: unknown }) =>
							e.resource &&
							typeof e.resource === 'object' &&
							'textureDescriptor' in (e.resource as Record<string, unknown>)
					)
				);
			});

			expect(fragmentBindGroupCall).toBeDefined();
			if (!fragmentBindGroupCall) {
				throw new Error('Expected fragment bind group call with texture entries');
			}

			// Verify the texture view comes from the 64x64 storage texture
			const [fragmentBindGroupArg] = fragmentBindGroupCall as unknown[];
			const textureEntry = (
				fragmentBindGroupArg as { entries: Array<{ resource: unknown }> }
			).entries.find(
				(e: { resource: unknown }) =>
					e.resource &&
					typeof e.resource === 'object' &&
					'textureDescriptor' in (e.resource as Record<string, unknown>)
			);
			expect(textureEntry).toBeDefined();
			if (!textureEntry) {
				throw new Error('Expected texture entry in fragment bind group');
			}

			const viewDescriptor = (textureEntry.resource as { textureDescriptor: GPUTextureDescriptor })
				.textureDescriptor;
			const size = viewDescriptor.size as { width: number };
			// Must be the 64x64 storage texture, NOT the 1x1 fallback
			expect(size.width).toBe(64);
		});

		it('does not add STORAGE_BINDING to non-storage textures', async () => {
			const runtime = createWebGpuRuntime();
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;

			const textureDefinitions: TextureDefinitionMap = {
				uRegular: {
					source: canvas
				}
			};

			const renderer = await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uRegular'],
					textureDefinitions
				})
			);

			// Trigger a render to create the texture from source
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: { uRegular: canvas }
			});

			// Find the 64x64 texture (created from canvas source)
			const regularTexture = runtime.textures.find(
				(t) =>
					t.descriptor.size &&
					typeof t.descriptor.size === 'object' &&
					'width' in t.descriptor.size &&
					t.descriptor.size.width === 64
			);
			expect(regularTexture).toBeDefined();
			// Should NOT have STORAGE_BINDING
			expect(regularTexture!.descriptor.usage! & GPUTextureUsage.STORAGE_BINDING).toBeFalsy();
		});
	});

	describe('renderer: storage texture bind group for compute dispatch', () => {
		it('binds storage texture at group 2 during compute dispatch', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 64,
					height: 64
				}
			};

			const computePass = {
				isCompute: true as const,
				enabled: true,
				getCompute: () =>
					'@compute @workgroup_size(8, 8)\nfn compute(@builtin(global_invocation_id) id: vec3u) {\n  textureStore(uDensity, vec2u(id.x, id.y), vec4f(1.0));\n}',
				resolveDispatch: () => [8, 8, 1] as [number, number, number],
				getWorkgroupSize: () => [8, 8, 1] as [number, number, number]
			};

			const renderer = await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity'],
					getPasses: () => [computePass]
				})
			);

			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});

			// Verify compute pass was started
			const encoder = runtime.device.createCommandEncoder.mock.results[0]?.value;
			expect(encoder).toBeDefined();
			expect(encoder.beginComputePass).toHaveBeenCalled();

			// Verify createBindGroup was called for the storage texture bind group
			// The storage texture bind group should be created with the texture view
			const bindGroupCalls = runtime.device.createBindGroup.mock.calls;
			expect(bindGroupCalls.length).toBeGreaterThanOrEqual(1);

			// Verify setBindGroup was called with group index 2
			const computePassInstance = encoder.beginComputePass.mock.results[0]?.value;
			expect(computePassInstance).toBeDefined();

			const setBindGroupCalls = computePassInstance.setBindGroup.mock.calls;
			const group2Call = setBindGroupCalls.find((call: unknown[]) => call[0] === 2);
			expect(group2Call).toBeDefined();
		});

		it('does not bind group 2 when no storage textures are defined', async () => {
			const runtime = createWebGpuRuntime();

			const computePass = {
				isCompute: true as const,
				enabled: true,
				getCompute: () =>
					'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}',
				resolveDispatch: () => [1, 1, 1] as [number, number, number],
				getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
			};

			const renderer = await createRenderer(
				baseOptions(runtime, {
					storageBufferKeys: ['buf'],
					storageBufferDefinitions: {
						buf: { size: 64, type: 'array<f32>', access: 'read-write' }
					},
					getPasses: () => [computePass]
				})
			);

			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});

			const encoder = runtime.device.createCommandEncoder.mock.results[0]?.value;
			const computePassInstance = encoder.beginComputePass.mock.results[0]?.value;

			const setBindGroupCalls = computePassInstance.setBindGroup.mock.calls;
			const group2Call = setBindGroupCalls.find((call: unknown[]) => call[0] === 2);
			// Group 2 should NOT be bound when there are no storage textures
			expect(group2Call).toBeUndefined();
		});

		it('binds both storage buffer (group 1) and storage texture (group 2) when both present', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 32,
					height: 32
				}
			};

			const computePass = {
				isCompute: true as const,
				enabled: true,
				getCompute: () =>
					'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {\n  let v = particles[0u];\n  textureStore(uDensity, vec2u(0u, 0u), vec4f(v));\n}',
				resolveDispatch: () => [1, 1, 1] as [number, number, number],
				getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
			};

			const renderer = await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity'],
					storageBufferKeys: ['particles'],
					storageBufferDefinitions: {
						particles: { size: 256, type: 'array<f32>', access: 'read-write' }
					},
					getPasses: () => [computePass]
				})
			);

			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});

			const encoder = runtime.device.createCommandEncoder.mock.results[0]?.value;
			const computePassInstance = encoder.beginComputePass.mock.results[0]?.value;
			const calls = computePassInstance.setBindGroup.mock.calls;

			// Group 0 = uniforms
			expect(calls.some((c: unknown[]) => c[0] === 0)).toBe(true);
			// Group 1 = storage buffers
			expect(calls.some((c: unknown[]) => c[0] === 1)).toBe(true);
			// Group 2 = storage textures
			expect(calls.some((c: unknown[]) => c[0] === 2)).toBe(true);
		});
	});

	describe('renderer: multiple compute passes share storage textures', () => {
		it('binds same storage texture for multiple compute pass dispatches', async () => {
			const runtime = createWebGpuRuntime();
			const textureDefinitions: TextureDefinitionMap = {
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 64,
					height: 64
				}
			};

			const clearPass = {
				isCompute: true as const,
				enabled: true,
				getCompute: () =>
					'@compute @workgroup_size(8, 8)\nfn compute(@builtin(global_invocation_id) id: vec3u) {\n  textureStore(uDensity, vec2u(id.x, id.y), vec4f(0.0));\n}',
				resolveDispatch: () => [8, 8, 1] as [number, number, number],
				getWorkgroupSize: () => [8, 8, 1] as [number, number, number]
			};

			const writePass = {
				isCompute: true as const,
				enabled: true,
				getCompute: () =>
					'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {\n  textureStore(uDensity, vec2u(id.x, 0u), vec4f(1.0));\n}',
				resolveDispatch: () => [1, 1, 1] as [number, number, number],
				getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
			};

			const renderer = await createRenderer(
				baseOptions(runtime, {
					textureKeys: ['uDensity'],
					textureDefinitions,
					storageTextureKeys: ['uDensity'],
					getPasses: () => [clearPass, writePass]
				})
			);

			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});

			const encoder = runtime.device.createCommandEncoder.mock.results[0]?.value;
			// Both compute passes should be dispatched
			expect(encoder.beginComputePass).toHaveBeenCalledTimes(2);

			// Both should have group 2 bound
			for (let i = 0; i < 2; i++) {
				const cp = encoder.beginComputePass.mock.results[i]?.value;
				const group2 = cp.setBindGroup.mock.calls.find((c: unknown[]) => c[0] === 2);
				expect(group2).toBeDefined();
			}
		});
	});
});
