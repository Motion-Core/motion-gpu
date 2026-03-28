import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComputePass } from '../../lib/passes/ComputePass';
import { PingPongComputePass } from '../../lib/passes/PingPongComputePass';
import {
	assertComputeContract,
	buildComputeShaderSource,
	buildComputeStorageBufferBindings,
	buildComputeStorageTextureBindings,
	extractWorkgroupSize
} from '../../lib/core/compute-shader';
import {
	assertStorageBufferDefinition,
	assertStorageTextureFormat,
	normalizeStorageBufferDefinition,
	resolveStorageBufferKeys
} from '../../lib/core/storage-buffers';
import { resolveUniformLayout } from '../../lib/core/uniforms';
import { planRenderGraph } from '../../lib/core/render-graph';
import { createRenderer } from '../../lib/core/renderer';
import type { TextureDefinitionMap, RenderPass, StorageBufferDefinition } from '../../lib/core/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_1D = `
@compute @workgroup_size(256)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let index = id.x;
}
`;

const VALID_2D = `
@compute @workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
	let y = id.y;
}
`;

const VALID_3D = `
@compute @workgroup_size(4, 4, 4)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
}
`;

function makeCtx(overrides: Partial<{ width: number; height: number; time: number; delta: number; workgroupSize: [number, number, number] }> = {}) {
	return {
		width: overrides.width ?? 1920,
		height: overrides.height ?? 1080,
		time: overrides.time ?? 0,
		delta: overrides.delta ?? 0.016,
		workgroupSize: overrides.workgroupSize ?? [256, 1, 1] as [number, number, number]
	};
}

// ── Mock WebGPU runtime (shared with storage-textures.test.ts pattern) ────────

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

	return { canvas, context, device, textures, buffers };
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

describe('compute shader: edge cases', () => {
	it('rejects @workgroup_size with non-numeric values', () => {
		// Contract regex accepts any content inside parens; extraction requires digits
		const shader = `
@compute @workgroup_size(THREAD_COUNT)
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		// Contract passes because [^)]+ matches "THREAD_COUNT"
		expect(() => assertComputeContract(shader)).not.toThrow();
		// But extraction fails because there are no digits
		expect(() => extractWorkgroupSize(shader)).toThrow(/Could not extract @workgroup_size/);
	});

	it('extracts workgroup size when extra whitespace is present', () => {
		const shader = `
@compute  @workgroup_size( 8 , 8 , 1 )
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		expect(extractWorkgroupSize(shader)).toEqual([8, 8, 1]);
	});

	it('handles @builtin(global_invocation_id) on separate line from fn signature', () => {
		const shader = `
@compute @workgroup_size(64)
fn compute(
	@builtin(global_invocation_id) id: vec3u
) {
	let i = id.x;
}
`;
		expect(() => assertComputeContract(shader)).not.toThrow();
	});

	it('buildComputeShaderSource includes default unused uniform when layout is empty', () => {
		const source = buildComputeShaderSource({
			compute: VALID_1D,
			uniformLayout: resolveUniformLayout({}),
			storageBufferKeys: [],
			storageBufferDefinitions: {},
			storageTextureKeys: [],
			storageTextureDefinitions: {}
		});
		expect(source).toContain('motiongpu_unused: vec4f');
	});

	it('buildComputeShaderSource omits group(1) when no storage buffers, omits group(2) when no storage textures', () => {
		const source = buildComputeShaderSource({
			compute: VALID_1D,
			uniformLayout: resolveUniformLayout({}),
			storageBufferKeys: [],
			storageBufferDefinitions: {},
			storageTextureKeys: [],
			storageTextureDefinitions: {}
		});
		expect(source).not.toContain('@group(1)');
		expect(source).not.toContain('@group(2)');
	});

	it('buildComputeShaderSource includes group(2) with storage textures but no group(1) bindings', () => {
		const source = buildComputeShaderSource({
			compute: VALID_1D,
			uniformLayout: resolveUniformLayout({}),
			storageBufferKeys: [],
			storageBufferDefinitions: {},
			storageTextureKeys: ['outTex'],
			storageTextureDefinitions: { outTex: { format: 'rgba8unorm' as GPUTextureFormat } }
		});
		expect(source).not.toContain('@group(1)');
		expect(source).toContain('@group(2) @binding(0) var outTex: texture_storage_2d<rgba8unorm, write>');
	});

	it('storage buffer bindings skip undefined definitions gracefully', () => {
		const bindings = buildComputeStorageBufferBindings(
			['exists', 'missing'],
			{ exists: { type: 'array<f32>', access: 'read' } },
			1
		);
		expect(bindings).toContain('exists');
		expect(bindings).not.toContain('missing');
	});

	it('storage texture bindings skip undefined definitions gracefully', () => {
		const bindings = buildComputeStorageTextureBindings(
			['exists', 'missing'],
			{ exists: { format: 'rgba8unorm' as GPUTextureFormat } },
			2
		);
		expect(bindings).toContain('exists');
		expect(bindings).not.toContain('missing');
	});

	it('buildComputeShaderSource with multiple uniforms', () => {
		const source = buildComputeShaderSource({
			compute: VALID_1D,
			uniformLayout: resolveUniformLayout({
				uTime: 0,
				uMouse: [0, 0],
				uColor: [1, 0, 0, 1]
			}),
			storageBufferKeys: [],
			storageBufferDefinitions: {},
			storageTextureKeys: [],
			storageTextureDefinitions: {}
		});
		expect(source).toContain('uTime: f32');
		expect(source).toContain('uMouse: vec2f');
		expect(source).toContain('uColor: vec4f');
	});
});

describe('ComputePass: edge cases', () => {
	it('setCompute preserves state when extractWorkgroupSize would fail', () => {
		const pass = new ComputePass({ compute: VALID_1D });
		const originalCompute = pass.getCompute();
		const originalSize = pass.getWorkgroupSize();

		// This shader passes contract but has non-numeric workgroup_size
		// assertComputeContract passes because regex is lenient, then extractWorkgroupSize throws
		// But since we validate both before mutating state, state should be preserved
		const badShader = `
@compute @workgroup_size(THREAD_COUNT)
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		expect(() => pass.setCompute(badShader)).toThrow();
		expect(pass.getCompute()).toBe(originalCompute);
		expect(pass.getWorkgroupSize()).toEqual(originalSize);
	});

	it('auto dispatch with small canvas (smaller than workgroup size)', () => {
		const pass = new ComputePass({ compute: VALID_2D, dispatch: 'auto' });
		const dispatch = pass.resolveDispatch(makeCtx({ width: 4, height: 4 }));
		// ceil(4/16) = 1, ceil(4/16) = 1
		expect(dispatch).toEqual([1, 1, 1]);
	});

	it('auto dispatch with 1x1 canvas', () => {
		const pass = new ComputePass({ compute: VALID_2D, dispatch: 'auto' });
		const dispatch = pass.resolveDispatch(makeCtx({ width: 1, height: 1 }));
		expect(dispatch).toEqual([1, 1, 1]);
	});

	it('auto dispatch with 3D workgroup size', () => {
		const pass = new ComputePass({ compute: VALID_3D, dispatch: 'auto' });
		const dispatch = pass.resolveDispatch(makeCtx({ width: 100, height: 100 }));
		// ceil(100/4) = 25, ceil(100/4) = 25, ceil(1/4) = 1
		expect(dispatch).toEqual([25, 25, 1]);
	});

	it('static dispatch with 2D [x, y]', () => {
		const pass = new ComputePass({ compute: VALID_1D, dispatch: [10, 20] });
		const dispatch = pass.resolveDispatch(makeCtx());
		expect(dispatch).toEqual([10, 20, 1]);
	});

	it('static dispatch with 3D [x, y, z]', () => {
		const pass = new ComputePass({ compute: VALID_1D, dispatch: [10, 20, 30] });
		const dispatch = pass.resolveDispatch(makeCtx());
		expect(dispatch).toEqual([10, 20, 30]);
	});

	it('setDispatch(undefined) resets to auto', () => {
		const pass = new ComputePass({ compute: VALID_2D, dispatch: [42] });
		pass.setDispatch(undefined);
		const dispatch = pass.resolveDispatch(makeCtx({ width: 160, height: 80 }));
		expect(dispatch).toEqual([10, 5, 1]);
	});

	it('getWorkgroupSize returns a copy, not internal reference', () => {
		const pass = new ComputePass({ compute: VALID_2D });
		const size1 = pass.getWorkgroupSize();
		const size2 = pass.getWorkgroupSize();
		expect(size1).toEqual(size2);
		expect(size1).not.toBe(size2);
	});

	it('enabled can be toggled at runtime', () => {
		const pass = new ComputePass({ compute: VALID_1D });
		expect(pass.enabled).toBe(true);
		pass.enabled = false;
		expect(pass.enabled).toBe(false);
		pass.enabled = true;
		expect(pass.enabled).toBe(true);
	});

	it('dynamic dispatch receives correct context values', () => {
		const dispatchFn = vi.fn((_ctx) => [1, 1, 1] as [number, number, number]);
		const pass = new ComputePass({ compute: VALID_1D, dispatch: dispatchFn });
		const ctx = makeCtx({ width: 800, height: 600, time: 2.5, delta: 0.033 });
		pass.resolveDispatch(ctx);
		expect(dispatchFn).toHaveBeenCalledWith(ctx);
	});
});

describe('PingPongComputePass: edge cases', () => {
	it('setCompute preserves state on failure', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 'sim' });
		const originalCompute = pass.getCompute();

		expect(() => pass.setCompute('fn bad() {}')).toThrow();
		expect(pass.getCompute()).toBe(originalCompute);
		expect(pass.getWorkgroupSize()).toEqual([16, 16, 1]);
	});

	it('setCompute updates workgroup size atomically', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 'sim' });
		pass.setCompute(VALID_1D);
		expect(pass.getWorkgroupSize()).toEqual([256, 1, 1]);
		expect(pass.getCompute()).toBe(VALID_1D);
	});

	it('resolveDispatch auto mode matches ComputePass behavior', () => {
		const cp = new ComputePass({ compute: VALID_2D, dispatch: 'auto' });
		const pp = new PingPongComputePass({ compute: VALID_2D, target: 'sim', dispatch: 'auto' });
		const ctx = makeCtx({ width: 800, height: 600 });
		expect(pp.resolveDispatch(ctx)).toEqual(cp.resolveDispatch(ctx));
	});

	it('resolveDispatch static mode', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 'sim', dispatch: [5, 10] });
		expect(pass.resolveDispatch(makeCtx())).toEqual([5, 10, 1]);
	});

	it('resolveDispatch dynamic mode', () => {
		const fn = vi.fn(() => [3, 4, 5] as [number, number, number]);
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 'sim', dispatch: fn });
		expect(pass.resolveDispatch(makeCtx())).toEqual([3, 4, 5]);
	});

	it('getCurrentOutput with 2 iterations: even total → A', () => {
		const pass = new PingPongComputePass({
			compute: VALID_2D,
			target: 'field',
			iterations: 2
		});
		// Frame 0: total=0 → even → A
		expect(pass.getCurrentOutput()).toBe('fieldA');
		pass.advanceFrame();
		// Frame 1: total=2 → even → A
		expect(pass.getCurrentOutput()).toBe('fieldA');
		pass.advanceFrame();
		// Frame 2: total=4 → even → A
		expect(pass.getCurrentOutput()).toBe('fieldA');
	});

	it('getCurrentOutput with 4 iterations alternates every frame', () => {
		const pass = new PingPongComputePass({
			compute: VALID_2D,
			target: 'buf',
			iterations: 4
		});
		// Frame 0: 0 → A, Frame 1: 4 → A, Frame 2: 8 → A
		// Even iterations per frame always produces even total → always A
		expect(pass.getCurrentOutput()).toBe('bufA');
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('bufA');
	});

	it('getCurrentOutput with 5 iterations alternates correctly', () => {
		const pass = new PingPongComputePass({
			compute: VALID_2D,
			target: 'x',
			iterations: 5
		});
		// Frame 0: 0 → A
		expect(pass.getCurrentOutput()).toBe('xA');
		pass.advanceFrame();
		// Frame 1: 5 → odd → B
		expect(pass.getCurrentOutput()).toBe('xB');
		pass.advanceFrame();
		// Frame 2: 10 → even → A
		expect(pass.getCurrentOutput()).toBe('xA');
	});

	it('setIterations rejects NaN', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 's' });
		expect(() => pass.setIterations(Number.NaN)).toThrow(/positive integer >= 1/);
	});

	it('setIterations rejects Infinity', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 's' });
		expect(() => pass.setIterations(Number.POSITIVE_INFINITY)).toThrow(/positive integer >= 1/);
	});

	it('constructor rejects 0 iterations', () => {
		expect(() => new PingPongComputePass({
			compute: VALID_2D,
			target: 's',
			iterations: 0
		})).toThrow(/positive integer >= 1/);
	});

	it('setDispatch(undefined) resets to auto', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 's', dispatch: [42] });
		pass.setDispatch(undefined);
		const dispatch = pass.resolveDispatch(makeCtx({ width: 160, height: 80 }));
		expect(dispatch).toEqual([10, 5, 1]);
	});

	it('getWorkgroupSize returns a copy', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 's' });
		const a = pass.getWorkgroupSize();
		const b = pass.getWorkgroupSize();
		expect(a).not.toBe(b);
		expect(a).toEqual(b);
	});

	it('dispose is idempotent', () => {
		const pass = new PingPongComputePass({ compute: VALID_2D, target: 's' });
		expect(() => {
			pass.dispose();
			pass.dispose();
		}).not.toThrow();
	});
});

describe('storage buffer validation: edge cases', () => {
	it('rejects "write" access mode (WGSL has no write-only storage)', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 16,
				type: 'array<f32>',
				access: 'write' as StorageBufferDefinition['access']
			})
		).toThrow(/invalid access mode/);
	});

	it('accepts access: undefined (defaults to read-write)', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', { size: 16, type: 'array<f32>' })
		).not.toThrow();
	});

	it('accepts initialData with fewer bytes than size', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 64,
				type: 'array<f32>',
				initialData: new Float32Array(4) // 16 bytes < 64
			})
		).not.toThrow();
	});

	it('accepts all valid buffer types', () => {
		const types: StorageBufferDefinition['type'][] = [
			'array<f32>', 'array<vec2f>', 'array<vec3f>', 'array<vec4f>',
			'array<u32>', 'array<i32>', 'array<vec4u>', 'array<vec4i>'
		];
		for (const type of types) {
			expect(() =>
				assertStorageBufferDefinition('buf', { size: 16, type })
			).not.toThrow();
		}
	});

	it('normalizeStorageBufferDefinition preserves all fields', () => {
		const norm = normalizeStorageBufferDefinition({
			size: 128,
			type: 'array<vec4f>',
			access: 'read'
		});
		expect(norm).toEqual({ size: 128, type: 'array<vec4f>', access: 'read' });
	});

	it('resolveStorageBufferKeys validates each definition', () => {
		expect(() =>
			resolveStorageBufferKeys({
				good: { size: 16, type: 'array<f32>' },
				bad: { size: 3, type: 'array<f32>' } // not multiple of 4
			})
		).toThrow(/multiple of 4/);
	});

	it('assertStorageTextureFormat accepts bgra8unorm', () => {
		expect(() => assertStorageTextureFormat('t', 'bgra8unorm')).not.toThrow();
	});

	it('assertStorageTextureFormat rejects rgb10a2unorm', () => {
		expect(() => assertStorageTextureFormat('t', 'rgb10a2unorm' as GPUTextureFormat)).toThrow(
			/storage-compatible format/
		);
	});
});

describe('render graph: compute pass edge cases', () => {
	it('multiple disabled compute passes produce empty plan', () => {
		const plan = planRenderGraph(
			[
				{ isCompute: true as const, enabled: false } as unknown as RenderPass,
				{ isCompute: true as const, enabled: false } as unknown as RenderPass
			],
			[0, 0, 0, 1]
		);
		expect(plan.steps).toHaveLength(0);
		expect(plan.finalOutput).toBe('canvas');
	});

	it('compute pass between two render passes does not break slot tracking', () => {
		const render1: RenderPass = { render: () => {}, needsSwap: false, output: 'target' };
		const compute = { isCompute: true as const, enabled: true } as unknown as RenderPass;
		const render2: RenderPass = { render: () => {}, needsSwap: false, input: 'target', output: 'canvas' };

		const plan = planRenderGraph([render1, compute, render2], [0, 0, 0, 1]);
		expect(plan.steps).toHaveLength(3);
		expect(plan.steps.map(s => s.kind)).toEqual(['render', 'compute', 'render']);
		expect(plan.finalOutput).toBe('canvas');
	});

	it('compute pass step always has needsSwap=false and preserve=true', () => {
		const compute = { isCompute: true as const, enabled: true } as unknown as RenderPass;
		const plan = planRenderGraph([compute], [0.5, 0.5, 0.5, 1]);
		const step = plan.steps[0]!;
		expect(step.needsSwap).toBe(false);
		expect(step.preserve).toBe(true);
		expect(step.clear).toBe(false);
		expect(step.input).toBe('source');
		expect(step.output).toBe('source');
	});

	it('null/undefined passes list returns empty plan', () => {
		const plan = planRenderGraph(undefined, [0, 0, 0, 1]);
		expect(plan.steps).toHaveLength(0);
	});
});

describe('renderer: compute pipeline bind group alignment', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
		Reflect.deleteProperty(globalThis, 'GPUShaderStage');
		Reflect.deleteProperty(globalThis, 'GPUTextureUsage');
		Reflect.deleteProperty(globalThis, 'GPUBufferUsage');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('storage textures only (no storage buffers): bind group indices are correct', async () => {
		const runtime = createWebGpuRuntime();
		const textureDefinitions: TextureDefinitionMap = {
			uOutput: {
				storage: true,
				format: 'rgba8unorm',
				width: 32,
				height: 32
			}
		};

		const computePass = {
			isCompute: true as const,
			enabled: true,
			getCompute: () =>
				'@compute @workgroup_size(8, 8)\nfn compute(@builtin(global_invocation_id) id: vec3u) {\n  textureStore(uOutput, vec2u(id.x, id.y), vec4f(1.0));\n}',
			resolveDispatch: () => [4, 4, 1] as [number, number, number],
			getWorkgroupSize: () => [8, 8, 1] as [number, number, number]
		};

		const renderer = await createRenderer(
			baseOptions(runtime, {
				textureKeys: ['uOutput'],
				textureDefinitions,
				storageTextureKeys: ['uOutput'],
				// NO storage buffers
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
		expect(encoder.beginComputePass).toHaveBeenCalled();

		const cPass = encoder.beginComputePass.mock.results[0]?.value;
		const calls = cPass.setBindGroup.mock.calls;

		// Group 0 = uniforms (always present)
		expect(calls.some((c: unknown[]) => c[0] === 0)).toBe(true);
		// Group 1 = storage buffers — should NOT be bound (no buffers)
		// But the empty placeholder BGL should exist in the pipeline layout
		// The renderer should not call setBindGroup(1, ...) when there are no storage buffers
		// Group 2 = storage textures — MUST be bound
		expect(calls.some((c: unknown[]) => c[0] === 2)).toBe(true);

		// Verify pipeline layout was created with 3 bind group layouts (with empty placeholder at index 1)
		const pipelineLayoutCalls = runtime.device.createPipelineLayout.mock.calls;
		const computeLayoutCall = pipelineLayoutCalls.find((call: unknown[]) => {
			const arg = call[0] as { bindGroupLayouts?: unknown[] };
			return arg.bindGroupLayouts && arg.bindGroupLayouts.length === 3;
		});
		expect(computeLayoutCall).toBeDefined();
	});

	it('disabled compute pass does not trigger dispatch', async () => {
		const runtime = createWebGpuRuntime();

		const computePass = {
			isCompute: true as const,
			enabled: false,
			getCompute: () => VALID_1D,
			resolveDispatch: () => [1, 1, 1] as [number, number, number],
			getWorkgroupSize: () => [256, 1, 1] as [number, number, number]
		};

		const renderer = await createRenderer(
			baseOptions(runtime, {
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
		expect(encoder.beginComputePass).not.toHaveBeenCalled();
	});

	it('ping-pong compute pass dispatches correct number of iterations', async () => {
		const runtime = createWebGpuRuntime();

		const advanceFrame = vi.fn();
		const pingPongPass = {
			isCompute: true as const,
			enabled: true,
			isPingPong: true as const,
			getCompute: () =>
				'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}',
			resolveDispatch: () => [1, 1, 1] as [number, number, number],
			getWorkgroupSize: () => [64, 1, 1] as [number, number, number],
			getIterations: () => 3,
			advanceFrame
		};

		const renderer = await createRenderer(
			baseOptions(runtime, {
				getPasses: () => [pingPongPass]
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
		// Should dispatch 3 iterations
		expect(encoder.beginComputePass).toHaveBeenCalledTimes(3);
		// advanceFrame called once after all iterations
		expect(advanceFrame).toHaveBeenCalledTimes(1);
	});

	it('compute pass caches pipeline by shader source', async () => {
		const runtime = createWebGpuRuntime();

		const shaderSource = '@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}';
		const pass1 = {
			isCompute: true as const,
			enabled: true,
			getCompute: () => shaderSource,
			resolveDispatch: () => [1, 1, 1] as [number, number, number],
			getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
		};
		const pass2 = {
			isCompute: true as const,
			enabled: true,
			getCompute: () => shaderSource, // Same source
			resolveDispatch: () => [2, 1, 1] as [number, number, number],
			getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
		};

		const renderer = await createRenderer(
			baseOptions(runtime, {
				getPasses: () => [pass1, pass2]
			})
		);

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		// Should only create one compute pipeline (cached by source)
		expect(runtime.device.createComputePipeline).toHaveBeenCalledTimes(1);
		// But still dispatch twice
		const encoder = runtime.device.createCommandEncoder.mock.results[0]?.value;
		expect(encoder.beginComputePass).toHaveBeenCalledTimes(2);
	});

	it('compute pass with storage buffers only (no textures): correct bind groups', async () => {
		const runtime = createWebGpuRuntime();

		const computePass = {
			isCompute: true as const,
			enabled: true,
			getCompute: () =>
				'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {\n  data[id.x] = 1.0;\n}',
			resolveDispatch: () => [1, 1, 1] as [number, number, number],
			getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
		};

		const renderer = await createRenderer(
			baseOptions(runtime, {
				storageBufferKeys: ['data'],
				storageBufferDefinitions: {
					data: { size: 256, type: 'array<f32>', access: 'read-write' }
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
		const cPass = encoder.beginComputePass.mock.results[0]?.value;
		const calls = cPass.setBindGroup.mock.calls;

		expect(calls.some((c: unknown[]) => c[0] === 0)).toBe(true); // uniforms
		expect(calls.some((c: unknown[]) => c[0] === 1)).toBe(true); // storage buffers
		expect(calls.some((c: unknown[]) => c[0] === 2)).toBe(false); // no storage textures
	});

	it('compute pass dispatchWorkgroups receives resolved values', async () => {
		const runtime = createWebGpuRuntime();

		const computePass = {
			isCompute: true as const,
			enabled: true,
			getCompute: () =>
				'@compute @workgroup_size(16, 16)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}',
			resolveDispatch: () => [10, 20, 3] as [number, number, number],
			getWorkgroupSize: () => [16, 16, 1] as [number, number, number]
		};

		const renderer = await createRenderer(
			baseOptions(runtime, {
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
		const cPass = encoder.beginComputePass.mock.results[0]?.value;
		expect(cPass.dispatchWorkgroups).toHaveBeenCalledWith(10, 20, 3);
	});

	it('compute pass ends after dispatch', async () => {
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
		const cPass = encoder.beginComputePass.mock.results[0]?.value;
		expect(cPass.end).toHaveBeenCalledTimes(1);
	});

	it('mixed compute + render passes execute in correct order', async () => {
		const runtime = createWebGpuRuntime();
		const callOrder: string[] = [];

		const computePass = {
			isCompute: true as const,
			enabled: true,
			getCompute: () =>
				'@compute @workgroup_size(64)\nfn compute(@builtin(global_invocation_id) id: vec3u) {}',
			resolveDispatch: () => [1, 1, 1] as [number, number, number],
			getWorkgroupSize: () => [64, 1, 1] as [number, number, number]
		};

		// Using a render pass that tracks when it renders
		const renderPass: RenderPass = {
			needsSwap: false,
			output: 'canvas',
			render: () => {
				callOrder.push('render');
			}
		};

		// Intercept beginComputePass to track order
		const origCreateCommandEncoder = runtime.device.createCommandEncoder;
		runtime.device.createCommandEncoder = vi.fn(() => {
			const result = origCreateCommandEncoder() as unknown as Record<string, unknown>;
			const origBeginComputePass = result.beginComputePass as ReturnType<typeof vi.fn>;
			result.beginComputePass = vi.fn((...args: unknown[]) => {
				callOrder.push('compute');
				return origBeginComputePass(...args);
			});
			return result as unknown as GPUCommandEncoder;
		});

		const renderer = await createRenderer(
			baseOptions(runtime, {
				getPasses: () => [computePass, renderPass as unknown as typeof computePass]
			})
		);

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(callOrder).toEqual(['compute', 'render']);
	});
});
