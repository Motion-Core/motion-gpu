import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../../lib/core/renderer';
import { resolveUniformLayout } from '../../lib/core/uniforms';
import type { RenderPass, RenderTargetDefinitionMap } from '../../lib/core/types';

type MockTexture = {
	descriptor: GPUTextureDescriptor;
	destroy: ReturnType<typeof vi.fn>;
	createView: ReturnType<typeof vi.fn>;
};

interface MockWebGpuRuntime {
	canvas: HTMLCanvasElement;
	context: {
		configure: ReturnType<typeof vi.fn>;
		getCurrentTexture: ReturnType<typeof vi.fn>;
	};
	device: {
		queue: {
			writeTexture: ReturnType<typeof vi.fn>;
			copyExternalImageToTexture: ReturnType<typeof vi.fn>;
			writeBuffer: ReturnType<typeof vi.fn>;
			submit: ReturnType<typeof vi.fn>;
		};
		createShaderModule: ReturnType<typeof vi.fn>;
		createSampler: ReturnType<typeof vi.fn>;
		createTexture: ReturnType<typeof vi.fn>;
		createBindGroupLayout: ReturnType<typeof vi.fn>;
		createPipelineLayout: ReturnType<typeof vi.fn>;
		createRenderPipeline: ReturnType<typeof vi.fn>;
		createBuffer: ReturnType<typeof vi.fn>;
		createBindGroup: ReturnType<typeof vi.fn>;
		createCommandEncoder: ReturnType<typeof vi.fn>;
		addEventListener: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		lost: Promise<{ reason?: string; message?: string }>;
	};
	textures: MockTexture[];
	buffers: Array<{ destroy: ReturnType<typeof vi.fn>; descriptor: GPUBufferDescriptor }>;
	adapterRequest: ReturnType<typeof vi.fn>;
	emitUncapturedError: (message: string) => void;
	resolveDeviceLost: (info: { reason?: string; message?: string }) => void;
}

function createMockTexture(descriptor: GPUTextureDescriptor): MockTexture {
	const texture: MockTexture = {
		descriptor,
		destroy: vi.fn(),
		createView: vi.fn(() => ({ textureDescriptor: descriptor }) as unknown as GPUTextureView)
	};
	return texture;
}

function createWebGpuRuntime(): MockWebGpuRuntime {
	let resolveDeviceLost: ((info: { reason?: string; message?: string }) => void) | null = null;
	const lost = new Promise<{ reason?: string; message?: string }>((resolve) => {
		resolveDeviceLost = resolve;
	});
	const textures: MockTexture[] = [];
	const buffers: Array<{ destroy: ReturnType<typeof vi.fn>; descriptor: GPUBufferDescriptor }> = [];
	let uncapturedErrorHandler: ((event: { error: Error }) => void) | null = null;

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
		createCommandEncoder: vi.fn(() => {
			const pass = {
				setPipeline: vi.fn(),
				setBindGroup: vi.fn(),
				draw: vi.fn(),
				end: vi.fn()
			};
			return {
				copyTextureToTexture: vi.fn(),
				beginRenderPass: vi.fn(() => pass as unknown as GPURenderPassEncoder),
				finish: vi.fn(() => ({}) as unknown as GPUCommandBuffer)
			} as unknown as GPUCommandEncoder;
		}),
		addEventListener: vi.fn((type: string, handler: (event: { error: Error }) => void) => {
			if (type === 'uncapturederror') {
				uncapturedErrorHandler = handler;
			}
		}),
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

	Reflect.set(globalThis, 'GPUShaderStage', { FRAGMENT: 0x10 });
	Reflect.set(globalThis, 'GPUTextureUsage', {
		TEXTURE_BINDING: 1,
		COPY_DST: 2,
		RENDER_ATTACHMENT: 4,
		COPY_SRC: 8
	});
	Reflect.set(globalThis, 'GPUBufferUsage', {
		UNIFORM: 1,
		COPY_DST: 2
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
		adapterRequest,
		emitUncapturedError: (message: string) => {
			uncapturedErrorHandler?.({ error: new Error(message) });
		},
		resolveDeviceLost: (info: { reason?: string; message?: string }) => {
			resolveDeviceLost?.(info);
		}
	};
}

function baseOptions(runtime: MockWebGpuRuntime) {
	return {
		canvas: runtime.canvas,
		fragmentWgsl: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
		uniformLayout: resolveUniformLayout({}),
		textureKeys: [],
		textureDefinitions: {},
		outputColorSpace: 'srgb' as const,
		getClearColor: () => [0, 0, 0, 1] as [number, number, number, number],
		getDpr: () => 1,
		fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
		includeSources: {},
		fragmentLineMap: [null]
	};
}

describe('createRenderer', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
		Reflect.deleteProperty(globalThis, 'GPUShaderStage');
		Reflect.deleteProperty(globalThis, 'GPUTextureUsage');
		Reflect.deleteProperty(globalThis, 'GPUBufferUsage');
		vi.restoreAllMocks();
	});

	it('throws when WebGPU runtime is unavailable', async () => {
		const runtime = createWebGpuRuntime();
		Reflect.deleteProperty(navigator, 'gpu');

		await expect(createRenderer(baseOptions(runtime))).rejects.toThrow(/WebGPU is not available/);
	});

	it('throws when canvas cannot provide webgpu context', async () => {
		const runtime = createWebGpuRuntime();
		(runtime.canvas.getContext as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

		await expect(createRenderer(baseOptions(runtime))).rejects.toThrow(
			/Canvas does not support webgpu context/
		);
	});

	it('throws when adapter cannot be acquired', async () => {
		const runtime = createWebGpuRuntime();
		runtime.adapterRequest.mockResolvedValueOnce(null);

		await expect(
			createRenderer({
				...baseOptions(runtime),
				adapterOptions: {
					powerPreference: 'high-performance'
				}
			})
		).rejects.toThrow(/Unable to acquire WebGPU adapter/);
		expect(runtime.adapterRequest).toHaveBeenCalledWith({
			powerPreference: 'high-performance'
		});
	});

	it('surfaces uncaptured GPU errors exactly once and keeps rendering afterwards', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer(baseOptions(runtime));

		runtime.emitUncapturedError('validation failed');
		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).toThrow(/WebGPU uncaptured error: validation failed/);

		expect(() =>
			renderer.render({
				time: 0.016,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).not.toThrow();
		expect(runtime.device.queue.submit).toHaveBeenCalledTimes(1);
	});

	it('surfaces device lost error after loss promise resolves', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer(baseOptions(runtime));

		runtime.resolveDeviceLost({ reason: 'destroyed', message: 'gpu reset' });
		await Promise.resolve();

		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).toThrow(/WebGPU device lost: gpu reset \(destroyed\)/);
	});

	it('updates uniform buffer incrementally using dirty ranges', async () => {
		const runtime = createWebGpuRuntime();
		const layout = resolveUniformLayout({
			uA: { type: 'f32', value: 0 },
			uB: { type: 'vec2f', value: [0, 0] }
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			uniformLayout: layout
		});
		const uniformBuffer = runtime.buffers[1];
		if (!uniformBuffer) {
			throw new Error('Missing uniform buffer');
		}

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: { uA: 1, uB: [2, 3] },
			textures: {}
		});
		const firstWrites = runtime.device.queue.writeBuffer.mock.calls.filter(
			(call) => call[0] === (uniformBuffer as unknown as GPUBuffer)
		);
		expect(firstWrites).toHaveLength(1);

		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: { uA: 1, uB: [2, 3] },
			textures: {}
		});
		const secondWrites = runtime.device.queue.writeBuffer.mock.calls.filter(
			(call) => call[0] === (uniformBuffer as unknown as GPUBuffer)
		);
		expect(secondWrites).toHaveLength(1);

		renderer.render({
			time: 0.032,
			delta: 0.016,
			renderMode: 'always',
			uniforms: { uA: 1, uB: [2, 9] },
			textures: {}
		});
		const thirdWrites = runtime.device.queue.writeBuffer.mock.calls.filter(
			(call) => call[0] === (uniformBuffer as unknown as GPUBuffer)
		);
		expect(thirdWrites).toHaveLength(2);
		expect(thirdWrites[1]?.[1]).toBeGreaterThan(0);
	});

	it('manages pass and render-target lifecycle across frame-to-frame config changes', async () => {
		const runtime = createWebGpuRuntime();
		const passA: RenderPass = {
			render: vi.fn(),
			setSize: vi.fn(),
			dispose: vi.fn(),
			needsSwap: false,
			output: 'canvas'
		};
		const passB: RenderPass = {
			render: vi.fn(),
			setSize: vi.fn(),
			dispose: vi.fn(),
			needsSwap: false,
			output: 'canvas'
		};

		let activePasses: RenderPass[] = [passA];
		let activeTargets: RenderTargetDefinitionMap | undefined = {
			uFx: { width: 8, height: 8, format: 'rgba8unorm' }
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			getPasses: () => activePasses,
			getRenderTargets: () => activeTargets
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});
		expect(passA.setSize).toHaveBeenCalledTimes(1);

		activePasses = [passA, passB];
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});
		expect(passA.setSize).toHaveBeenCalledTimes(1);
		expect(passB.setSize).toHaveBeenCalledTimes(1);

		const fxTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 8 && size.height === 8;
		});
		expect(fxTexture).toBeDefined();

		activePasses = [passB];
		activeTargets = {};
		renderer.render({
			time: 0.032,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});
		expect(passA.dispose).toHaveBeenCalledTimes(1);
		expect(fxTexture?.destroy).toHaveBeenCalledTimes(1);

		renderer.destroy();
		expect(passB.dispose).toHaveBeenCalledTimes(1);
		expect(runtime.device.removeEventListener).toHaveBeenCalledWith(
			'uncapturederror',
			expect.any(Function)
		);
	});
});
