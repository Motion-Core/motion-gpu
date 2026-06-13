import { afterEach, describe, expect, it, vi } from 'vitest';
import { getShaderCompilationDiagnostics } from '../../lib/core/error-diagnostics';
import { toMotionGPUErrorReport } from '../../lib/core/error-report';
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
		features: GPUSupportedFeatures;
		createShaderModule: ReturnType<typeof vi.fn>;
		createSampler: ReturnType<typeof vi.fn>;
		createTexture: ReturnType<typeof vi.fn>;
		createBindGroupLayout: ReturnType<typeof vi.fn>;
		createPipelineLayout: ReturnType<typeof vi.fn>;
		createRenderPipeline: ReturnType<typeof vi.fn>;
		createComputePipeline: ReturnType<typeof vi.fn>;
		createBuffer: ReturnType<typeof vi.fn>;
		createBindGroup: ReturnType<typeof vi.fn>;
		createCommandEncoder: ReturnType<typeof vi.fn>;
		addEventListener: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		pushErrorScope: ReturnType<typeof vi.fn>;
		popErrorScope: ReturnType<typeof vi.fn>;
		destroy: ReturnType<typeof vi.fn>;
		lost: Promise<{ reason?: string; message?: string }>;
	};
	textures: MockTexture[];
	buffers: Array<{ destroy: ReturnType<typeof vi.fn>; descriptor: GPUBufferDescriptor }>;
	renderPasses: Array<{
		setPipeline: ReturnType<typeof vi.fn>;
		setBindGroup: ReturnType<typeof vi.fn>;
		draw: ReturnType<typeof vi.fn>;
		end: ReturnType<typeof vi.fn>;
	}>;
	computePasses: Array<{
		setPipeline: ReturnType<typeof vi.fn>;
		setBindGroup: ReturnType<typeof vi.fn>;
		dispatchWorkgroups: ReturnType<typeof vi.fn>;
		end: ReturnType<typeof vi.fn>;
	}>;
	commandEncoders: Array<{
		copyTextureToTexture: ReturnType<typeof vi.fn>;
		copyBufferToBuffer: ReturnType<typeof vi.fn>;
		beginRenderPass: ReturnType<typeof vi.fn>;
		beginComputePass: ReturnType<typeof vi.fn>;
		finish: ReturnType<typeof vi.fn>;
	}>;
	adapterRequest: ReturnType<typeof vi.fn>;
	emitUncapturedError: (message: string) => void;
	resolveDeviceLost: (info: { reason?: string; message?: string }) => void;
}

function createMockTexture(descriptor: GPUTextureDescriptor): MockTexture {
	const texture: MockTexture = {
		descriptor,
		destroy: vi.fn(),
		createView: vi.fn(
			(viewDescriptor?: GPUTextureViewDescriptor) =>
				({
					textureDescriptor: descriptor,
					viewDescriptor
				}) as unknown as GPUTextureView
		)
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
	const renderPasses: MockWebGpuRuntime['renderPasses'] = [];
	const computePasses: MockWebGpuRuntime['computePasses'] = [];
	const commandEncoders: MockWebGpuRuntime['commandEncoders'] = [];
	let uncapturedErrorHandler: ((event: { error: Error }) => void) | null = null;
	let currentCanvasFormat: GPUTextureFormat = 'rgba8unorm';

	const device = {
		queue: {
			writeTexture: vi.fn(),
			copyExternalImageToTexture: vi.fn(),
			writeBuffer: vi.fn(),
			submit: vi.fn()
		},
		features: new Set() as unknown as GPUSupportedFeatures,
		createShaderModule: vi.fn(
			(descriptor: GPUShaderModuleDescriptor) =>
				({
					code: descriptor.code,
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
		createRenderPipeline: vi.fn(
			(descriptor: GPURenderPipelineDescriptor) =>
				({
					descriptor
				}) as unknown as GPURenderPipeline
		),
		createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
			const buffer = { destroy: vi.fn(), descriptor };
			buffers.push(buffer);
			return buffer as unknown as GPUBuffer;
		}),
		createBindGroup: vi.fn(() => ({}) as unknown as GPUBindGroup),
		createComputePipeline: vi.fn(() => ({}) as unknown as GPUComputePipeline),
		createCommandEncoder: vi.fn(() => {
			const computePass = {
				setPipeline: vi.fn(),
				setBindGroup: vi.fn(),
				dispatchWorkgroups: vi.fn(),
				end: vi.fn()
			};
			computePasses.push(computePass);
			const encoder = {
				copyTextureToTexture: vi.fn(),
				copyBufferToBuffer: vi.fn(),
				beginRenderPass: vi.fn(() => {
					const pass = {
						setPipeline: vi.fn(),
						setBindGroup: vi.fn(),
						draw: vi.fn(),
						end: vi.fn()
					};
					renderPasses.push(pass);
					return pass as unknown as GPURenderPassEncoder;
				}),
				beginComputePass: vi.fn(() => computePass as unknown as GPUComputePassEncoder),
				finish: vi.fn(() => ({}) as unknown as GPUCommandBuffer)
			};
			commandEncoders.push(encoder);
			return encoder as unknown as GPUCommandEncoder;
		}),
		addEventListener: vi.fn((type: string, handler: (event: { error: Error }) => void) => {
			if (type === 'uncapturederror') {
				uncapturedErrorHandler = handler;
			}
		}),
		removeEventListener: vi.fn(),
		pushErrorScope: vi.fn(),
		popErrorScope: vi.fn(async () => null),
		destroy: vi.fn(),
		lost
	};

	const adapterRequest = vi.fn(async () => ({
		requestDevice: vi.fn(async () => device as unknown as GPUDevice)
	}));

	const context = {
		configure: vi.fn((descriptor: GPUCanvasConfiguration) => {
			currentCanvasFormat = descriptor.format;
		}),
		getCurrentTexture: vi.fn(() => {
			const texture = createMockTexture({
				size: { width: 10, height: 10, depthOrArrayLayers: 1 },
				format: currentCanvasFormat,
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
		renderPasses,
		computePasses,
		commandEncoders,
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
		getClearColor: () => [0, 0, 0, 1] as [number, number, number, number],
		getDpr: () => 1,
		fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
		includeSources: {},
		fragmentLineMap: [null]
	};
}

function getShaderCodes(runtime: MockWebGpuRuntime): string[] {
	return runtime.device.createShaderModule.mock.calls.map(
		(call) => (call[0] as { code?: string }).code ?? ''
	);
}

function getCreatedPipelines(runtime: MockWebGpuRuntime): GPURenderPipeline[] {
	return runtime.device.createRenderPipeline.mock.results
		.map((result) => result.value as GPURenderPipeline | undefined)
		.filter((pipeline): pipeline is GPURenderPipeline => pipeline !== undefined);
}

function getPipelineShaderCode(pipeline: GPURenderPipeline | undefined): string {
	const descriptor = (
		pipeline as unknown as { descriptor?: GPURenderPipelineDescriptor } | undefined
	)?.descriptor;
	const module = descriptor?.fragment?.module as { code?: string } | undefined;
	return module?.code ?? '';
}

describe('createRenderer', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
		Reflect.deleteProperty(globalThis, 'GPUShaderStage');
		Reflect.deleteProperty(globalThis, 'GPUTextureUsage');
		Reflect.deleteProperty(globalThis, 'GPUBufferUsage');
		vi.unstubAllGlobals();
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
		const requestRender = vi.fn();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			requestRender
		});

		runtime.emitUncapturedError('validation failed');
		expect(requestRender).toHaveBeenCalledTimes(1);

		runtime.emitUncapturedError('validation failed');
		expect(requestRender).toHaveBeenCalledTimes(1);

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

	it('prefers root uncaptured error over derived invalid command buffer messages', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer(baseOptions(runtime));

		runtime.emitUncapturedError(
			'Dispatch workgroup count X (66317) exceeds max compute workgroups per dimension (65535).'
		);
		runtime.emitUncapturedError(
			'[Invalid CommandBuffer] is invalid due to a previous error.\n - While calling [Queue].Submit([[Invalid CommandBuffer]])'
		);

		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).toThrow(
			/WebGPU uncaptured error: Dispatch workgroup count X \(66317\) exceeds max compute workgroups per dimension \(65535\)\./
		);

		expect(() =>
			renderer.render({
				time: 0.016,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).not.toThrow();
	});

	it('surfaces device lost error after loss promise resolves', async () => {
		const runtime = createWebGpuRuntime();
		const requestRender = vi.fn();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			requestRender
		});

		runtime.resolveDeviceLost({ reason: 'destroyed', message: 'gpu reset' });
		await Promise.resolve();
		expect(requestRender).toHaveBeenCalledTimes(1);

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

	it('reallocates scaled render targets when DPR-scaled canvas size changes', async () => {
		const runtime = createWebGpuRuntime();
		let dpr = 1;
		const pass: RenderPass = {
			needsSwap: false,
			input: 'uHalf',
			output: 'canvas',
			render: vi.fn()
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			getDpr: () => dpr,
			renderTargets: {
				uHalf: { scale: 0.5, format: 'rgba8unorm' }
			},
			passes: [
				{
					needsSwap: false,
					output: 'uHalf',
					render: vi.fn()
				},
				pass
			]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {},
			canvasSize: { width: 320, height: 240 }
		});

		expect(pass.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({ width: 160, height: 120 }),
				targets: expect.objectContaining({
					uHalf: expect.objectContaining({ width: 160, height: 120 })
				})
			})
		);
		const firstTarget = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 160 && size.height === 120;
		});
		expect(firstTarget).toBeDefined();

		dpr = 2;
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {},
			canvasSize: { width: 320, height: 240 }
		});

		expect(firstTarget?.destroy).toHaveBeenCalledTimes(1);
		expect(pass.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({ width: 320, height: 240 }),
				targets: expect.objectContaining({
					uHalf: expect.objectContaining({ width: 320, height: 240 })
				})
			})
		);

		renderer.destroy();
	});

	it('keeps pass and target lifecycle correct across topology churn', async () => {
		const runtime = createWebGpuRuntime();
		const passA: RenderPass = {
			needsSwap: false,
			output: 'fxA',
			render: vi.fn(),
			setSize: vi.fn(),
			dispose: vi.fn()
		};
		const passB: RenderPass = {
			needsSwap: false,
			input: 'fxA',
			output: 'canvas',
			render: vi.fn(),
			setSize: vi.fn(),
			dispose: vi.fn()
		};
		const passC: RenderPass = {
			needsSwap: false,
			output: 'fxB',
			render: vi.fn(),
			setSize: vi.fn(),
			dispose: vi.fn()
		};

		let activePasses: RenderPass[] = [passA, passB];
		let activeTargets: RenderTargetDefinitionMap = {
			fxA: { width: 6, height: 6, format: 'rgba8unorm' }
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
		const fxATexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 6 && size.height === 6;
		});
		expect(fxATexture).toBeDefined();
		expect(passA.setSize).toHaveBeenCalledTimes(1);
		expect(passB.setSize).toHaveBeenCalledTimes(1);

		activePasses = [passC];
		activeTargets = {
			fxB: { width: 12, height: 4, format: 'rgba8unorm' }
		};
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(passA.dispose).toHaveBeenCalledTimes(1);
		expect(passB.dispose).toHaveBeenCalledTimes(1);
		expect(passC.setSize).toHaveBeenCalledTimes(1);
		expect(fxATexture?.destroy).toHaveBeenCalledTimes(1);
		expect(passC.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				targets: expect.not.objectContaining({
					fxA: expect.anything()
				})
			})
		);

		activePasses = [passA, passC];
		activeTargets = {
			fxA: { width: 10, height: 10, format: 'rgba8unorm' },
			fxB: { width: 12, height: 4, format: 'rgba8unorm' }
		};
		renderer.render({
			time: 0.032,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(passA.setSize).toHaveBeenCalledTimes(2);
		expect(passC.setSize).toHaveBeenCalledTimes(1);
		expect(passA.render).toHaveBeenCalledTimes(2);
		expect(passC.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				targets: expect.objectContaining({
					fxA: expect.objectContaining({ width: 10, height: 10 }),
					fxB: expect.objectContaining({ width: 12, height: 4 })
				})
			})
		);

		renderer.destroy();
		expect(passA.dispose).toHaveBeenCalledTimes(2);
		expect(passC.dispose).toHaveBeenCalledTimes(1);
	});

	it('does not register initialization cleanups after startup during runtime texture reallocations', async () => {
		const runtime = createWebGpuRuntime();
		const sourceA = document.createElement('canvas');
		sourceA.width = 4;
		sourceA.height = 4;
		const sourceB = document.createElement('canvas');
		sourceB.width = 8;
		sourceB.height = 8;

		let cleanupRegistrations = 0;
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: { uTex: {} },
			__onInitializationCleanupRegistered: () => {
				cleanupRegistrations += 1;
			}
		});

		const registrationsDuringStartup = cleanupRegistrations;
		expect(registrationsDuringStartup).toBeGreaterThan(0);

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceA }
		});
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceB }
		});

		expect(cleanupRegistrations).toBe(registrationsDuringStartup);
	});

	it('destroys newly allocated runtime texture when upload fails during reallocation', async () => {
		const runtime = createWebGpuRuntime();
		const sourceA = document.createElement('canvas');
		sourceA.width = 4;
		sourceA.height = 4;
		const sourceB = document.createElement('canvas');
		sourceB.width = 8;
		sourceB.height = 8;
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: { uTex: {} }
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceA }
		});
		const previousTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 4 && size.height === 4;
		});
		expect(previousTexture).toBeDefined();

		runtime.device.queue.copyExternalImageToTexture.mockImplementationOnce(() => {
			throw new Error('upload failed');
		});

		expect(() =>
			renderer.render({
				time: 0.016,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: { uTex: sourceB }
			})
		).toThrow(/upload failed/);

		const failedTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 8 && size.height === 8;
		});
		expect(failedTexture).toBeDefined();
		expect(failedTexture?.destroy).toHaveBeenCalledTimes(1);
		expect(previousTexture?.destroy).not.toHaveBeenCalled();

		renderer.destroy();
	});

	it('invalidates cached graph plan when pass clear semantics change between frames', async () => {
		const runtime = createWebGpuRuntime();
		const beginDescriptors: GPURenderPassDescriptor[] = [];

		runtime.device.createCommandEncoder.mockImplementation(() => {
			const passEncoder = {
				setPipeline: vi.fn(),
				setBindGroup: vi.fn(),
				draw: vi.fn(),
				end: vi.fn()
			};
			return {
				copyTextureToTexture: vi.fn(),
				beginRenderPass: vi.fn((descriptor: GPURenderPassDescriptor) => {
					beginDescriptors.push(descriptor);
					return passEncoder as unknown as GPURenderPassEncoder;
				}),
				finish: vi.fn(() => ({}) as unknown as GPUCommandBuffer)
			} as unknown as GPUCommandEncoder;
		});

		const pass: RenderPass = {
			needsSwap: false,
			input: 'source',
			output: 'canvas',
			clear: false,
			preserve: true,
			render: vi.fn((context) => {
				const renderPass = context.beginRenderPass();
				renderPass.end();
			})
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			passes: [pass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		pass.clear = true;
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const firstPassAttachment = Array.from(beginDescriptors[1]?.colorAttachments ?? [])[0];
		const secondPassAttachment = Array.from(beginDescriptors[4]?.colorAttachments ?? [])[0];
		expect(firstPassAttachment?.loadOp).toBe('load');
		expect(secondPassAttachment?.loadOp).toBe('clear');
	});

	it('attaches shader diagnostics and cleans up listeners when compilation fails', async () => {
		const runtime = createWebGpuRuntime();
		runtime.device.createShaderModule.mockReturnValueOnce({
			getCompilationInfo: vi.fn(async () => ({
				messages: [
					{
						type: 'error',
						message: 'unknown symbol foo',
						lineNum: 11,
						linePos: 4,
						length: 3
					}
				]
			}))
		} as unknown as GPUShaderModule);

		let thrown: unknown;
		try {
			await createRenderer({
				...baseOptions(runtime),
				fragmentLineMap: [null, { kind: 'fragment', line: 1 }]
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain('WGSL compilation failed');
		const diagnostics = getShaderCompilationDiagnostics(thrown);
		expect(diagnostics?.diagnostics[0]?.message).toBe('unknown symbol foo');
		expect(diagnostics?.runtimeContext).toEqual({
			passGraph: {
				passCount: 0,
				enabledPassCount: 0,
				inputs: [],
				outputs: []
			},
			activeRenderTargets: []
		});
		expect(runtime.device.removeEventListener).toHaveBeenCalledWith(
			'uncapturederror',
			expect.any(Function)
		);
	});

	it('updates onInvalidate textures only on invalidation conditions', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 4;
		source.height = 4;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					update: 'onInvalidate'
				}
			}
		});

		const uploads = (): number => runtime.device.queue.copyExternalImageToTexture.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});
		expect(uploads()).toBe(1);

		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});
		expect(uploads()).toBe(1);

		renderer.render({
			time: 0.032,
			delta: 0.016,
			renderMode: 'manual',
			uniforms: {},
			textures: { uTex: source }
		});
		expect(uploads()).toBe(2);

		renderer.render({
			time: 0.048,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: { source } }
		});
		expect(uploads()).toBe(3);
	});

	it('updates perFrame textures every render frame even for stable source token', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 4;
		source.height = 4;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					update: 'perFrame'
				}
			}
		});

		const uploads = (): number => runtime.device.queue.copyExternalImageToTexture.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});

		expect(uploads()).toBe(2);
	});

	it('uploads a new same-sized source without reallocating the GPU texture', async () => {
		const runtime = createWebGpuRuntime();
		const sourceA = document.createElement('canvas');
		sourceA.width = 4;
		sourceA.height = 4;
		const sourceB = document.createElement('canvas');
		sourceB.width = 4;
		sourceB.height = 4;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					update: 'once'
				}
			}
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceA }
		});

		const uploadsAfterFirstRender =
			runtime.device.queue.copyExternalImageToTexture.mock.calls.length;
		const allocatedTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 4 && size.height === 4;
		});
		expect(allocatedTexture).toBeDefined();

		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceB }
		});

		const uploadsAfterSecondRender =
			runtime.device.queue.copyExternalImageToTexture.mock.calls.length;
		expect(uploadsAfterSecondRender).toBe(uploadsAfterFirstRender + 1);

		const allocatedTextures = runtime.textures.filter((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 4 && size.height === 4;
		});
		expect(allocatedTextures).toHaveLength(1);
		expect(allocatedTexture?.destroy).toHaveBeenCalledTimes(0);
	});

	it('keeps existing runtime texture usable when same-sized upload fails', async () => {
		const runtime = createWebGpuRuntime();
		const sourceA = document.createElement('canvas');
		sourceA.width = 4;
		sourceA.height = 4;
		const sourceB = document.createElement('canvas');
		sourceB.width = 4;
		sourceB.height = 4;
		const sourceC = document.createElement('canvas');
		sourceC.width = 4;
		sourceC.height = 4;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					update: 'once'
				}
			}
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceA }
		});

		const textureAllocationsAfterFirstRender = runtime.device.createTexture.mock.calls.length;
		const uploadsAfterFirstRender =
			runtime.device.queue.copyExternalImageToTexture.mock.calls.length;
		const allocatedTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 4 && size.height === 4;
		});
		expect(allocatedTexture).toBeDefined();

		runtime.device.queue.copyExternalImageToTexture.mockImplementationOnce(() => {
			throw new Error('same-size upload failed');
		});

		expect(() =>
			renderer.render({
				time: 0.016,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: { uTex: { source: sourceB, flipY: true, premultipliedAlpha: true } }
			})
		).toThrow(/same-size upload failed/);

		expect(runtime.device.createTexture.mock.calls.length).toBe(textureAllocationsAfterFirstRender);
		expect(allocatedTexture?.destroy).not.toHaveBeenCalled();

		renderer.render({
			time: 0.032,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: sourceC }
		});

		expect(runtime.device.createTexture.mock.calls.length).toBe(textureAllocationsAfterFirstRender);
		expect(runtime.device.queue.copyExternalImageToTexture.mock.calls.length).toBe(
			uploadsAfterFirstRender + 2
		);
		expect(runtime.device.queue.copyExternalImageToTexture.mock.calls.at(-1)?.[0]).toMatchObject({
			source: sourceC
		});
	});

	it('destroys runtime textures and restores fallback when texture is cleared', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 6;
		source.height = 6;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: { uTex: {} }
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});

		const uploadedTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 6 && size.height === 6;
		});
		expect(uploadedTexture).toBeDefined();

		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: null }
		});

		expect(uploadedTexture?.destroy).toHaveBeenCalledTimes(1);
		expect(runtime.device.createBindGroup.mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	it('generates texture mipmaps with GPU render passes after the base upload', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 8;
		source.height = 4;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					source,
					generateMipmaps: true
				}
			}
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(runtime.device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);

		const uploadedTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 8 && size.height === 4;
		});
		expect(uploadedTexture?.descriptor.mipLevelCount).toBe(4);
		expect(uploadedTexture?.createView).toHaveBeenCalledWith(
			expect.objectContaining({ baseMipLevel: 0, mipLevelCount: 1 })
		);
		expect(uploadedTexture?.createView).toHaveBeenCalledWith(
			expect.objectContaining({ baseMipLevel: 1, mipLevelCount: 1 })
		);
		expect(uploadedTexture?.createView).toHaveBeenCalledWith(
			expect.objectContaining({ baseMipLevel: 2, mipLevelCount: 1 })
		);
		expect(uploadedTexture?.createView).toHaveBeenCalledWith(
			expect.objectContaining({ baseMipLevel: 3, mipLevelCount: 1 })
		);

		const encoder = runtime.commandEncoders[0];
		expect(encoder?.beginRenderPass).toHaveBeenCalledTimes(4);
		const mipPassOrder = encoder?.beginRenderPass.mock.invocationCallOrder[0];
		const scenePassOrder = encoder?.beginRenderPass.mock.invocationCallOrder[3];
		if (mipPassOrder === undefined || scenePassOrder === undefined) {
			throw new Error('Missing mipmap or scene render pass order');
		}
		expect(mipPassOrder).toBeLessThan(scenePassOrder);
	});

	it('does not allocate CPU canvas fallback while generating mipmaps', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 8;
		source.height = 8;
		const originalCreateElement = document.createElement.bind(document);
		const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((
			tagName: string
		) => {
			if (tagName === 'canvas') {
				throw new Error('CPU mipmap canvas should not be allocated');
			}

			return originalCreateElement(tagName);
		}) as typeof document.createElement);
		vi.stubGlobal('OffscreenCanvas', undefined);

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					source,
					generateMipmaps: true
				}
			}
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(createElementSpy).not.toHaveBeenCalledWith('canvas');
		expect(runtime.device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
		expect(runtime.commandEncoders[0]?.beginRenderPass).toHaveBeenCalledTimes(4);
	});

	it('reuses the GPU mipmap pipeline across per-frame texture updates', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 8;
		source.height = 8;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {
					generateMipmaps: true,
					update: 'perFrame'
				}
			}
		});
		const pipelinesAfterInit = runtime.device.createRenderPipeline.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});

		expect(runtime.device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
		expect(runtime.device.createRenderPipeline.mock.calls.length).toBe(pipelinesAfterInit + 1);
		expect(runtime.commandEncoders[0]?.beginRenderPass).toHaveBeenCalledTimes(4);
		expect(runtime.commandEncoders[1]?.beginRenderPass).toHaveBeenCalledTimes(4);
	});

	it('uses a premultiplied direct canvas scene pipeline when no render passes are active', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			getClearColor: () => [1, 0, 0, 0.25] as [number, number, number, number]
		});

		const sceneShaders = getShaderCodes(runtime).filter((code) =>
			code.includes('fn motiongpuFragment')
		);
		expect(sceneShaders.some((code) => !code.includes('motiongpuPremultiplyForCanvas'))).toBe(true);
		expect(sceneShaders.some((code) => code.includes('motiongpuPremultiplyForCanvas'))).toBe(true);

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const directCanvasPipeline = getCreatedPipelines(runtime).find((pipeline) => {
			const shaderCode = getPipelineShaderCode(pipeline);
			return (
				shaderCode.includes('fn motiongpuFragment') &&
				shaderCode.includes('return motiongpuPremultiplyForCanvas(motiongpuOutput);')
			);
		});
		expect(directCanvasPipeline).toBeDefined();
		expect(runtime.commandEncoders[0]?.beginRenderPass).toHaveBeenCalledTimes(1);
		expect(runtime.renderPasses[0]?.setPipeline).toHaveBeenCalledWith(directCanvasPipeline);

		const descriptor = runtime.commandEncoders[0]?.beginRenderPass.mock.calls[0]?.[0] as
			| GPURenderPassDescriptor
			| undefined;
		const attachment = Array.from(descriptor?.colorAttachments ?? [])[0];
		expect(attachment?.clearValue).toEqual({ r: 0.25, g: 0, b: 0, a: 0.25 });
	});

	it('blits final source slot to canvas when pass graph ends offscreen', async () => {
		const runtime = createWebGpuRuntime();
		const pass: RenderPass = {
			needsSwap: true,
			render: vi.fn()
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			passes: [pass]
		});
		const bindGroupCallsBeforeRender = runtime.device.createBindGroup.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(pass.render).toHaveBeenCalledTimes(1);
		expect(runtime.device.createBindGroup.mock.calls.length).toBe(bindGroupCallsBeforeRender + 1);
	});

	it('renders through an HDR intermediate and final presentation pass for Khronos PBR Neutral', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			color: { toneMapping: 'khronos-pbr-neutral' }
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(runtime.context.configure).toHaveBeenCalledWith(
			expect.objectContaining({
				format: 'rgba8unorm',
				alphaMode: 'premultiplied'
			})
		);
		expect(
			runtime.textures.some((texture) => {
				const size = texture.descriptor.size as { width?: number; height?: number };
				return (
					size.width === 10 && size.height === 10 && texture.descriptor.format === 'rgba16float'
				);
			})
		).toBe(true);

		const encoder = runtime.commandEncoders[0];
		expect(encoder?.beginRenderPass).toHaveBeenCalledTimes(2);
		const shaderCodes = getShaderCodes(runtime);
		expect(shaderCodes.some((code) => code.includes('motiongpuKhronosPbrNeutral'))).toBe(true);
		const sceneShader = shaderCodes.find((code) => code.includes('fn motiongpuFragment'));
		const presentationShader = shaderCodes.find((code) =>
			code.includes('fn motiongpuPresentationFragment')
		);
		expect(sceneShader).toContain('out.uv = (position + vec2f(1.0, 1.0)) * 0.5;');
		expect(presentationShader).toContain(
			'out.uv = vec2f((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);'
		);
		expect(presentationShader).toContain('return motiongpuPremultiplyForCanvas(motiongpuOutput);');
		expect(presentationShader).not.toContain('out.uv = (position + vec2f(1.0, 1.0)) * 0.5;');
	});

	it('configures an extended rgba16float canvas for HDR presentation', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			color: { dynamicRange: 'hdr', canvasColorSpace: 'display-p3', outputEncoding: 'linear' }
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(runtime.context.configure).toHaveBeenCalledWith(
			expect.objectContaining({
				format: 'rgba16float',
				colorSpace: 'display-p3',
				toneMapping: { mode: 'extended' }
			})
		);
		expect(runtime.commandEncoders[0]?.beginRenderPass).toHaveBeenCalledTimes(2);
		const presentationShader = getShaderCodes(runtime).find((code) =>
			code.includes('fn motiongpuPresentationFragment')
		);
		expect(presentationShader).toContain('return motiongpuPremultiplyForCanvas(motiongpuLinear);');
	});

	it('falls back from auto HDR presentation to SDR canvas configuration', async () => {
		const runtime = createWebGpuRuntime();
		runtime.context.configure.mockImplementationOnce((descriptor: GPUCanvasConfiguration) => {
			if (descriptor.format === 'rgba16float') {
				throw new Error('HDR canvas unsupported');
			}
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			color: { dynamicRange: 'auto', outputEncoding: 'linear' }
		});

		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).not.toThrow();

		expect(runtime.context.configure).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				format: 'rgba16float',
				toneMapping: { mode: 'extended' }
			})
		);
		expect(runtime.context.configure).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				format: 'rgba8unorm'
			})
		);
	});

	it('surfaces a clear error when explicit HDR canvas configuration is unsupported', async () => {
		const runtime = createWebGpuRuntime();
		runtime.context.configure.mockImplementationOnce((descriptor: GPUCanvasConfiguration) => {
			if (descriptor.format === 'rgba16float') {
				throw new Error('unsupported format');
			}
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			color: { dynamicRange: 'hdr' }
		});

		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).toThrow(/HDR canvas presentation is not supported.*unsupported format/i);
	});

	it('maps render-pass canvas output to an internal SDR final target before presentation', async () => {
		const runtime = createWebGpuRuntime();
		const pass: RenderPass = {
			needsSwap: false,
			input: 'source',
			output: 'canvas',
			render: vi.fn((context) => {
				const renderPass = context.beginRenderPass();
				renderPass.end();
			})
		};
		const renderer = await createRenderer({
			...baseOptions(runtime),
			passes: [pass]
		});
		const bindGroupCallsBeforeRender = runtime.device.createBindGroup.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const canvasTexture = runtime.context.getCurrentTexture.mock.results[0]?.value;
		const passRender = pass.render as ReturnType<typeof vi.fn>;
		const passContext = passRender.mock.calls[0]?.[0] as
			| Parameters<NonNullable<RenderPass['render']>>[0]
			| undefined;
		expect(passContext).toEqual(
			expect.objectContaining({
				output: expect.objectContaining({ width: 10, height: 10, format: 'rgba8unorm' }),
				canvas: expect.objectContaining({ width: 10, height: 10, format: 'rgba8unorm' })
			})
		);
		expect(passContext?.canvas.texture).not.toBe(canvasTexture);
		expect(passContext?.output.texture).toBe(passContext?.canvas.texture);
		expect(runtime.commandEncoders[0]?.beginRenderPass).toHaveBeenCalledTimes(3);
		expect(runtime.device.createBindGroup.mock.calls.length).toBe(bindGroupCallsBeforeRender + 1);

		const presentationPipeline = getCreatedPipelines(runtime).find((pipeline) => {
			const shaderCode = getPipelineShaderCode(pipeline);
			return (
				shaderCode.includes('fn motiongpuPresentationFragment') &&
				shaderCode.includes('return motiongpuPremultiplyForCanvas(motiongpuLinear);')
			);
		});
		expect(presentationPipeline).toBeDefined();
		expect(runtime.renderPasses[2]?.setPipeline).toHaveBeenCalledWith(presentationPipeline);
	});

	it('maps render-pass canvas output to an internal HDR final target before presentation', async () => {
		const runtime = createWebGpuRuntime();
		const pass: RenderPass = {
			needsSwap: false,
			input: 'source',
			output: 'canvas',
			render: vi.fn((context) => {
				const renderPass = context.beginRenderPass();
				renderPass.end();
			})
		};
		const renderer = await createRenderer({
			...baseOptions(runtime),
			color: { toneMapping: 'khronos-pbr-neutral' },
			passes: [pass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(pass.render).toHaveBeenCalledWith(
			expect.objectContaining({
				output: expect.objectContaining({ format: 'rgba16float' }),
				canvas: expect.objectContaining({ format: 'rgba16float' })
			})
		);
		expect(runtime.commandEncoders[0]?.beginRenderPass).toHaveBeenCalledTimes(3);
	});

	it('maps named target slots into pass context', async () => {
		const runtime = createWebGpuRuntime();
		const passWrite: RenderPass = {
			needsSwap: false,
			output: 'fxMain',
			render: vi.fn()
		};
		const passRead: RenderPass = {
			needsSwap: false,
			input: 'fxMain',
			output: 'canvas',
			render: vi.fn()
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			renderTargets: {
				fxMain: { width: 7, height: 7, format: 'rgba8unorm' }
			},
			passes: [passWrite, passRead]
		});
		const bindGroupCallsBeforeRender = runtime.device.createBindGroup.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(passWrite.render).toHaveBeenCalledTimes(1);
		expect(passRead.render).toHaveBeenCalledTimes(1);
		expect(passRead.render).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({ width: 7, height: 7 }),
				output: expect.objectContaining({ width: 10, height: 10 }),
				targets: expect.objectContaining({
					fxMain: expect.objectContaining({ width: 7, height: 7 })
				})
			})
		);
		expect(runtime.device.createBindGroup.mock.calls.length).toBe(bindGroupCallsBeforeRender + 1);
	});

	it('throws when render graph references unknown runtime target slot', async () => {
		const runtime = createWebGpuRuntime();
		const pass: RenderPass = {
			needsSwap: false,
			output: 'missingTarget',
			render: vi.fn()
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			passes: [pass]
		});

		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).toThrow(/unknown target "missingTarget"/i);
	});

	it('blits final named target slot to canvas when pass graph ends offscreen', async () => {
		const runtime = createWebGpuRuntime();
		const pass: RenderPass = {
			needsSwap: false,
			output: 'fxMain',
			render: vi.fn()
		};

		const renderer = await createRenderer({
			...baseOptions(runtime),
			renderTargets: {
				fxMain: { width: 7, height: 7, format: 'rgba8unorm' }
			},
			passes: [pass]
		});
		const bindGroupCallsBeforeRender = runtime.device.createBindGroup.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(pass.render).toHaveBeenCalledTimes(1);
		expect(runtime.device.createBindGroup.mock.calls.length).toBe(bindGroupCallsBeforeRender + 1);
	});

	it('disposes live render targets and texture bindings on renderer destroy', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 5;
		source.height = 5;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uTex'],
			textureDefinitions: {
				uTex: {}
			},
			renderTargets: {
				uFx: { width: 7, height: 7, format: 'rgba8unorm' }
			}
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uTex: source }
		});

		const uploadedTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 5 && size.height === 5;
		});
		const runtimeTargetTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 7 && size.height === 7;
		});
		const fallbackTexture = runtime.textures.find((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return size.width === 1 && size.height === 1;
		});

		renderer.destroy();
		expect(uploadedTexture?.destroy).toHaveBeenCalledTimes(1);
		expect(runtimeTargetTexture?.destroy).toHaveBeenCalledTimes(1);
		expect(fallbackTexture?.destroy).toHaveBeenCalledTimes(1);
	});

	it('destroys the owned GPUDevice once when renderer.destroy() is called repeatedly', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer(baseOptions(runtime));

		renderer.destroy();
		renderer.destroy();

		expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
		expect(runtime.device.removeEventListener).toHaveBeenCalledTimes(1);
	});

	it('destroys the owned GPUDevice when initialization fails after device creation', async () => {
		const runtime = createWebGpuRuntime();
		runtime.device.createShaderModule.mockReturnValueOnce({
			getCompilationInfo: vi.fn(async () => ({
				messages: [
					{
						type: 'error',
						message: 'shader failed',
						lineNum: 1,
						linePos: 1,
						length: 1
					}
				]
			}))
		} as unknown as GPUShaderModule);

		await expect(createRenderer(baseOptions(runtime))).rejects.toThrow(/WGSL compilation failed/);
		expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
	});

	it('allocates GPU buffer with STORAGE usage for each storage buffer definition', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['particles'],
			storageBufferDefinitions: {
				particles: { size: 1024, type: 'array<vec4f>' }
			}
		});

		const storageBuffer = runtime.buffers.find((b) => (b.descriptor.usage & 128) !== 0);
		expect(storageBuffer).toBeDefined();
		expect(storageBuffer!.descriptor.size).toBe(1024);
		expect(storageBuffer!.descriptor.usage & 128).toBe(128); // STORAGE
		expect(storageBuffer!.descriptor.usage & 2).toBe(2); // COPY_DST
		expect(storageBuffer!.descriptor.usage & 4).toBe(4); // COPY_SRC

		renderer.destroy();
	});

	it('uploads initialData to storage buffer on creation', async () => {
		const runtime = createWebGpuRuntime();
		const initialData = new Float32Array([1, 2, 3, 4]);
		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['data'],
			storageBufferDefinitions: {
				data: { size: 16, type: 'array<f32>', initialData }
			}
		});

		const writeBufferCalls = runtime.device.queue.writeBuffer.mock.calls;
		const storageBuffer = runtime.buffers.find((b) => (b.descriptor.usage & 128) !== 0);
		const storageWriteCall = writeBufferCalls.find(
			(call) => call[0] === (storageBuffer as unknown as GPUBuffer)
		);
		expect(storageWriteCall).toBeDefined();

		renderer.destroy();
	});

	it('destroys storage buffers on renderer.destroy()', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['a', 'b'],
			storageBufferDefinitions: {
				a: { size: 256, type: 'array<f32>' },
				b: { size: 512, type: 'array<u32>' }
			}
		});

		const storageBuffers = runtime.buffers.filter((b) => (b.descriptor.usage & 128) !== 0);
		expect(storageBuffers).toHaveLength(2);

		renderer.destroy();

		for (const buf of storageBuffers) {
			expect(buf.destroy).toHaveBeenCalledTimes(1);
		}
	});

	it('does not allocate storage buffers when none declared', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer(baseOptions(runtime));

		const storageBuffers = runtime.buffers.filter((b) => (b.descriptor.usage & 128) !== 0);
		expect(storageBuffers).toHaveLength(0);

		renderer.destroy();
	});

	it('applies pending storage writes during render', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['particles'],
			storageBufferDefinitions: {
				particles: { size: 64, type: 'array<f32>' }
			}
		});

		const writeData = new Float32Array([5, 6, 7, 8]);
		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {},
			pendingStorageWrites: [{ name: 'particles', data: writeData, offset: 16 }]
		});

		const storageBuffer = runtime.buffers.find((b) => (b.descriptor.usage & 128) !== 0);
		const writeBufferCalls = runtime.device.queue.writeBuffer.mock.calls;
		const pendingWriteCall = writeBufferCalls.find(
			(call) => call[0] === (storageBuffer as unknown as GPUBuffer) && call[1] === 16
		);
		expect(pendingWriteCall).toBeDefined();

		renderer.destroy();
	});

	it('exposes getStorageBuffer to retrieve allocated GPU buffers', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['particles'],
			storageBufferDefinitions: {
				particles: { size: 256, type: 'array<vec4f>' }
			}
		});

		const gpuBuffer = renderer.getStorageBuffer?.('particles');
		expect(gpuBuffer).toBeDefined();
		expect(renderer.getStorageBuffer?.('nonexistent')).toBeUndefined();

		renderer.destroy();
	});

	it('exposes getDevice to retrieve active GPU device', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['data'],
			storageBufferDefinitions: {
				data: { size: 64, type: 'array<f32>' }
			}
		});

		const device = renderer.getDevice?.();
		expect(device).toBeDefined();
		expect(device?.createBuffer).toBeDefined();

		renderer.destroy();
	});

	it('clamps canvas to minimum 1x1 and falls back to dpr=1 for invalid dpr input', async () => {
		const runtime = createWebGpuRuntime();
		const rendererWithNaN = await createRenderer({
			...baseOptions(runtime),
			getDpr: () => Number.NaN
		});

		rendererWithNaN.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {},
			canvasSize: { width: 0, height: 0 }
		});
		expect(runtime.canvas.width).toBe(1);
		expect(runtime.canvas.height).toBe(1);

		const rendererWithZero = await createRenderer({
			...baseOptions(runtime),
			getDpr: () => 0
		});
		rendererWithZero.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {},
			canvasSize: { width: 2, height: 3 }
		});
		expect(runtime.canvas.width).toBe(2);
		expect(runtime.canvas.height).toBe(3);
	});

	it('creates compute pipeline and dispatches compute pass', async () => {
		const runtime = createWebGpuRuntime();
		const { ComputePass } = await import('../../lib/passes/ComputePass');
		const computePass = new ComputePass({
			compute: `@compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) id: vec3u) {}`,
			dispatch: [4, 1, 1]
		});

		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['data'],
			storageBufferDefinitions: {
				data: { size: 256, type: 'array<f32>' }
			},
			passes: [computePass as unknown as RenderPass]
		});
		const textureAllocationsBeforeRender = runtime.device.createTexture.mock.calls.length;

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(runtime.device.createComputePipeline).toHaveBeenCalled();
		expect(runtime.device.queue.submit).toHaveBeenCalledTimes(1);
		expect(runtime.device.createTexture.mock.calls.length).toBe(textureAllocationsBeforeRender);
		const encoder = runtime.commandEncoders[0];
		if (!encoder) {
			throw new Error('Missing command encoder');
		}
		expect(encoder?.beginComputePass).toHaveBeenCalledTimes(1);
		expect(encoder?.beginRenderPass).toHaveBeenCalledTimes(1);
		const computeOrder = encoder.beginComputePass.mock.invocationCallOrder[0];
		const renderOrder = encoder.beginRenderPass.mock.invocationCallOrder[0];
		if (computeOrder === undefined || renderOrder === undefined) {
			throw new Error('Missing command order');
		}
		expect(computeOrder).toBeLessThan(renderOrder);

		renderer.destroy();
	});

	it('omits fragment-stage texture bindings for texture slots marked fragmentVisible:false', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['albedo', 'computeOnly'],
			textureDefinitions: {
				albedo: { source: null },
				computeOnly: {
					storage: true,
					format: 'rgba8unorm',
					width: 8,
					height: 8,
					fragmentVisible: false
				}
			}
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const fragmentShaderCode = (
			runtime.device.createShaderModule.mock.calls[0]?.[0] as { code: string }
		)?.code;
		expect(fragmentShaderCode).toContain('albedoSampler');
		expect(fragmentShaderCode).toContain('var albedo: texture_2d<f32>;');
		expect(fragmentShaderCode).not.toContain('computeOnlySampler');
		expect(fragmentShaderCode).not.toContain('var computeOnly: texture_2d<f32>;');

		const sceneBindGroupLayout = runtime.device.createBindGroupLayout.mock.calls
			.map(
				(call) =>
					call[0] as {
						entries?: Array<{
							binding: number;
							sampler?: unknown;
							texture?: unknown;
							buffer?: { type?: string };
						}>;
					}
			)
			.find((descriptor) => {
				const entries = descriptor.entries ?? [];
				return (
					entries.some((entry) => entry.binding === 0 && entry.buffer?.type === 'uniform') &&
					entries.some((entry) => entry.binding === 1 && entry.buffer?.type === 'uniform') &&
					entries.some((entry) => entry.sampler !== undefined)
				);
			});

		expect(sceneBindGroupLayout).toBeDefined();
		const entries = sceneBindGroupLayout?.entries ?? [];
		const samplerEntries = entries.filter((entry) => entry.sampler !== undefined);
		const textureEntries = entries.filter((entry) => entry.texture !== undefined);
		expect(samplerEntries).toHaveLength(1);
		expect(textureEntries).toHaveLength(1);
	});

	it('uses unfilterable fragment texture layout for r32float textures without feature support', async () => {
		const runtime = createWebGpuRuntime();

		await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uFloat'],
			textureDefinitions: {
				uFloat: { format: 'r32float', filter: 'linear' }
			}
		});

		const sceneBindGroupLayout = runtime.device.createBindGroupLayout.mock.calls
			.map((call) => call[0] as GPUBindGroupLayoutDescriptor)
			.find((descriptor) => {
				const entries = Array.from(descriptor.entries);
				return (
					entries.some((entry) => entry.binding === 2 && entry.sampler !== undefined) &&
					entries.some((entry) => entry.binding === 3 && entry.texture !== undefined)
				);
			});
		expect(sceneBindGroupLayout).toBeDefined();
		const entries = Array.from(sceneBindGroupLayout?.entries ?? []);
		expect(entries.find((entry) => entry.binding === 2)?.sampler).toEqual({
			type: 'non-filtering'
		});
		expect(entries.find((entry) => entry.binding === 3)?.texture).toMatchObject({
			sampleType: 'unfilterable-float'
		});
		expect(runtime.device.createSampler).toHaveBeenCalledWith(
			expect.objectContaining({ magFilter: 'nearest', minFilter: 'nearest' })
		);
	});

	it('uses unfilterable fragment texture layout for fragment-visible rgba32float storage textures', async () => {
		const runtime = createWebGpuRuntime();

		await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['sim'],
			textureDefinitions: {
				sim: {
					storage: true,
					format: 'rgba32float',
					width: 8,
					height: 8,
					fragmentVisible: true
				}
			},
			storageTextureKeys: ['sim']
		});

		const sceneBindGroupLayout = runtime.device.createBindGroupLayout.mock.calls
			.map((call) => call[0] as GPUBindGroupLayoutDescriptor)
			.find((descriptor) => {
				const entries = Array.from(descriptor.entries);
				return (
					entries.some((entry) => entry.binding === 2 && entry.sampler !== undefined) &&
					entries.some((entry) => entry.binding === 3 && entry.texture !== undefined)
				);
			});
		expect(sceneBindGroupLayout).toBeDefined();
		const entries = Array.from(sceneBindGroupLayout?.entries ?? []);
		expect(entries.find((entry) => entry.binding === 2)?.sampler).toEqual({
			type: 'non-filtering'
		});
		expect(entries.find((entry) => entry.binding === 3)?.texture).toMatchObject({
			sampleType: 'unfilterable-float'
		});
	});

	it('reuses compute storage buffer bind group layout and bind group across stable frames', async () => {
		const runtime = createWebGpuRuntime();
		const { ComputePass } = await import('../../lib/passes/ComputePass');
		const computePass = new ComputePass({
			compute: `@compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) id: vec3u) {}`,
			dispatch: [4, 1, 1]
		});

		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['data'],
			storageBufferDefinitions: {
				data: { size: 256, type: 'array<f32>' }
			},
			passes: [computePass as unknown as RenderPass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const storageLayoutsAfterFirst = runtime.device.createBindGroupLayout.mock.calls
			.map((call) => call[0] as { entries?: Array<{ buffer?: { type?: string } }> })
			.filter((descriptor) =>
				descriptor.entries?.every(
					(entry) => typeof entry.buffer?.type === 'string' && entry.buffer.type === 'storage'
				)
			);

		const storageBindGroupsAfterFirst = runtime.device.createBindGroup.mock.calls
			.map(
				(call) =>
					call[0] as {
						entries?: Array<{ resource?: { buffer?: GPUBuffer } }>;
					}
			)
			.filter(
				(descriptor) =>
					descriptor.entries?.length === 1 &&
					typeof descriptor.entries[0]?.resource === 'object' &&
					descriptor.entries[0]?.resource !== null &&
					'buffer' in descriptor.entries[0]!.resource!
			);
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const storageLayoutsAfterSecond = runtime.device.createBindGroupLayout.mock.calls
			.map((call) => call[0] as { entries?: Array<{ buffer?: { type?: string } }> })
			.filter((descriptor) =>
				descriptor.entries?.every(
					(entry) => typeof entry.buffer?.type === 'string' && entry.buffer.type === 'storage'
				)
			);

		const storageBindGroupsAfterSecond = runtime.device.createBindGroup.mock.calls
			.map(
				(call) =>
					call[0] as {
						entries?: Array<{ resource?: { buffer?: GPUBuffer } }>;
					}
			)
			.filter(
				(descriptor) =>
					descriptor.entries?.length === 1 &&
					typeof descriptor.entries[0]?.resource === 'object' &&
					descriptor.entries[0]?.resource !== null &&
					'buffer' in descriptor.entries[0]!.resource!
			);

		expect(storageLayoutsAfterSecond).toHaveLength(storageLayoutsAfterFirst.length);
		expect(storageBindGroupsAfterSecond).toHaveLength(storageBindGroupsAfterFirst.length);

		renderer.destroy();
	});

	it('reuses compute storage texture bind group layout and bind group across stable frames', async () => {
		const runtime = createWebGpuRuntime();
		const { ComputePass } = await import('../../lib/passes/ComputePass');
		const computePass = new ComputePass({
			compute: `@compute @workgroup_size(8, 8, 1) fn compute(@builtin(global_invocation_id) id: vec3u) {}`,
			dispatch: [2, 2, 1]
		});

		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageTextureKeys: ['computeOutput'],
			textureKeys: ['computeOutput'],
			textureDefinitions: {
				computeOutput: {
					storage: true,
					format: 'rgba8unorm',
					width: 8,
					height: 8
				}
			},
			passes: [computePass as unknown as RenderPass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const storageTextureLayoutsAfterFirst = runtime.device.createBindGroupLayout.mock.calls
			.map(
				(call) =>
					call[0] as { entries?: Array<{ storageTexture?: { access?: string; format?: string } }> }
			)
			.filter(
				(descriptor) =>
					descriptor.entries?.length === 1 &&
					descriptor.entries[0]?.storageTexture?.access === 'write-only' &&
					descriptor.entries[0]?.storageTexture?.format === 'rgba8unorm'
			);

		const storageTextureBindGroupsAfterFirst = runtime.device.createBindGroup.mock.calls
			.map((call) => call[0] as { entries?: Array<{ resource?: unknown }> })
			.filter(
				(descriptor) =>
					descriptor.entries?.length === 1 &&
					typeof descriptor.entries[0]?.resource === 'object' &&
					descriptor.entries[0]?.resource !== null &&
					'textureDescriptor' in (descriptor.entries[0]!.resource as Record<string, unknown>)
			);
		renderer.render({
			time: 0.016,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const storageTextureLayoutsAfterSecond = runtime.device.createBindGroupLayout.mock.calls
			.map(
				(call) =>
					call[0] as { entries?: Array<{ storageTexture?: { access?: string; format?: string } }> }
			)
			.filter(
				(descriptor) =>
					descriptor.entries?.length === 1 &&
					descriptor.entries[0]?.storageTexture?.access === 'write-only' &&
					descriptor.entries[0]?.storageTexture?.format === 'rgba8unorm'
			);

		const storageTextureBindGroupsAfterSecond = runtime.device.createBindGroup.mock.calls
			.map((call) => call[0] as { entries?: Array<{ resource?: unknown }> })
			.filter(
				(descriptor) =>
					descriptor.entries?.length === 1 &&
					typeof descriptor.entries[0]?.resource === 'object' &&
					descriptor.entries[0]?.resource !== null &&
					'textureDescriptor' in (descriptor.entries[0]!.resource as Record<string, unknown>)
			);

		expect(storageTextureLayoutsAfterSecond).toHaveLength(storageTextureLayoutsAfterFirst.length);
		expect(storageTextureBindGroupsAfterSecond).toHaveLength(
			storageTextureBindGroupsAfterFirst.length
		);

		renderer.destroy();
	});

	it('attaches structured diagnostics when compute shader compilation fails', async () => {
		const runtime = createWebGpuRuntime();
		runtime.device.createComputePipeline.mockImplementation(() => {
			throw new Error('WGSL validation error: line 17: unknown symbol BAD_VALUE');
		});

		const { ComputePass } = await import('../../lib/passes/ComputePass');
		const computePass = new ComputePass({
			compute: [
				'@compute @workgroup_size(64, 1, 1)',
				'fn compute(@builtin(global_invocation_id) id: vec3u) {',
				'\tlet idx = id.x;',
				'\tif (idx < arrayLength(&data)) {',
				'\t\tdata[idx] = BAD_VALUE;',
				'\t}',
				'}'
			].join('\n'),
			dispatch: [4, 1, 1]
		});

		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['data'],
			storageBufferDefinitions: {
				data: { size: 256, type: 'array<f32>' }
			},
			passes: [computePass as unknown as RenderPass]
		});

		let thrown: unknown = null;
		try {
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain('Compute shader compilation failed');

		const diagnostics = getShaderCompilationDiagnostics(thrown);
		expect(diagnostics).not.toBeNull();
		expect(diagnostics?.shaderStage).toBe('compute');
		expect(diagnostics?.computeSource).toContain('BAD_VALUE');
		expect(diagnostics?.diagnostics[0]?.sourceLocation).toMatchObject({ kind: 'compute' });
		expect(
			(diagnostics?.diagnostics[0]?.sourceLocation as { line?: number } | null)?.line ?? 0
		).toBeGreaterThan(0);
		expect(diagnostics?.diagnostics[0]?.generatedLine).toBe(17);
		expect(diagnostics?.runtimeContext).toEqual({
			passGraph: {
				passCount: 1,
				enabledPassCount: 1,
				inputs: [],
				outputs: []
			},
			activeRenderTargets: []
		});

		renderer.destroy();
	});

	it('surfaces structured compute diagnostics from async compilation info instead of uncaptured noise', async () => {
		const runtime = createWebGpuRuntime();
		const requestRender = vi.fn();

		runtime.device.createShaderModule.mockImplementation((input: { code: string }) => {
			const isComputeShader = input.code.includes('@compute');
			return {
				getCompilationInfo: vi.fn(async () => ({
					messages: isComputeShader
						? [
								{
									type: 'error',
									message: "expected ';' for function call",
									lineNum: 17,
									linePos: 3,
									length: 1
								}
							]
						: []
				}))
			} as unknown as GPUShaderModule;
		});

		const { ComputePass } = await import('../../lib/passes/ComputePass');
		const computePass = new ComputePass({
			compute: [
				'@compute @workgroup_size(64, 1, 1)',
				'fn compute(@builtin(global_invocation_id) id: vec3u) {',
				'\tlet idx = id.x',
				'\tif (idx < arrayLength(&data)) {',
				'\t\tdata[idx] = 1.0;',
				'\t}',
				'}'
			].join('\n'),
			dispatch: [4, 1, 1]
		});

		const renderer = await createRenderer({
			...baseOptions(runtime),
			storageBufferKeys: ['data'],
			storageBufferDefinitions: {
				data: { size: 256, type: 'array<f32>' }
			},
			passes: [computePass as unknown as RenderPass],
			requestRender
		});

		expect(() => {
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});
		}).not.toThrow();

		await vi.waitFor(() => {
			expect(requestRender).toHaveBeenCalledTimes(1);
		});

		let thrown: unknown = null;
		try {
			renderer.render({
				time: 0.016,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain('Compute shader compilation failed');
		expect((thrown as Error).message).toContain("expected ';' for function call");

		const diagnostics = getShaderCompilationDiagnostics(thrown);
		expect(diagnostics?.shaderStage).toBe('compute');
		expect(diagnostics?.computeSource).toContain('let idx = id.x');
		expect(diagnostics?.diagnostics[0]?.message).toContain("expected ';' for function call");

		const report = toMotionGPUErrorReport(thrown, 'render');
		expect(report.code).toBe('COMPUTE_COMPILATION_FAILED');
		expect(report.title).toBe('Compute shader compilation failed');
		expect(report.source?.component).toBe('Compute shader');
		expect(report.message).toContain('compute line');
		expect(report.rawMessage).not.toContain('WebGPU uncaptured error');

		renderer.destroy();
	});

	it('dispatches ping-pong compute iterations with alternating read/write bind groups', async () => {
		const runtime = createWebGpuRuntime();
		const resolveDispatch = vi.fn(() => [1, 1, 1] as [number, number, number]);
		const advanceFrame = vi.fn();
		const pingPongPass = {
			enabled: true,
			isCompute: true,
			isPingPong: true,
			getCompute: () =>
				`@compute @workgroup_size(8, 8) fn compute(@builtin(global_invocation_id) id: vec3u) {}`,
			getWorkgroupSize: () => [8, 8, 1] as [number, number, number],
			resolveDispatch,
			getTarget: () => 'sim',
			getCurrentOutput: () => 'simB',
			getIterations: () => 2,
			advanceFrame
		};
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['sim'],
			textureDefinitions: {
				sim: {
					storage: true,
					format: 'rgba16float',
					width: 8,
					height: 8
				}
			},
			passes: [pingPongPass as unknown as RenderPass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(resolveDispatch).toHaveBeenCalledTimes(2);
		expect(advanceFrame).toHaveBeenCalledTimes(1);
		const pingPongBindGroups = runtime.device.createBindGroup.mock.calls
			.map((call) => call[0] as { entries: Array<{ binding: number; resource: unknown }> })
			.filter((descriptor) => {
				const first = descriptor.entries[0];
				const second = descriptor.entries[1];
				return (
					descriptor.entries.length === 2 &&
					first?.binding === 0 &&
					second?.binding === 1 &&
					typeof first.resource === 'object' &&
					first.resource !== null &&
					'textureDescriptor' in (first.resource as Record<string, unknown>)
				);
			});
		expect(pingPongBindGroups).toHaveLength(2);
		const firstEntries = pingPongBindGroups[0]!.entries;
		const secondEntries = pingPongBindGroups[1]!.entries;
		expect(secondEntries[0]?.resource).toBe(firstEntries[1]?.resource);
		expect(secondEntries[1]?.resource).toBe(firstEntries[0]?.resource);
		expect(runtime.computePasses[0]?.dispatchWorkgroups).toHaveBeenCalledTimes(2);
	});

	it('destroys ping-pong texture pairs during renderer.destroy()', async () => {
		const runtime = createWebGpuRuntime();
		const { PingPongComputePass } = await import('../../lib/passes/PingPongComputePass');
		const pingPongPass = new PingPongComputePass({
			compute: `@compute @workgroup_size(8, 8) fn compute(@builtin(global_invocation_id) id: vec3u) {}`,
			target: 'sim',
			dispatch: [1, 1, 1]
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['sim'],
			textureDefinitions: {
				sim: {
					storage: true,
					format: 'rgba16float',
					width: 8,
					height: 8
				}
			},
			passes: [pingPongPass as unknown as RenderPass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const storageTextures = runtime.textures.filter((texture) => {
			const size = texture.descriptor.size as { width?: number; height?: number };
			return (
				size.width === 8 &&
				size.height === 8 &&
				((texture.descriptor.usage as number) & GPUTextureUsage.STORAGE_BINDING) !== 0
			);
		});
		expect(storageTextures.length).toBeGreaterThanOrEqual(3);

		renderer.destroy();

		for (const texture of storageTextures) {
			expect(texture.destroy).toHaveBeenCalledTimes(1);
		}
	});

	it('renders ping-pong shader iterations before scene and exposes output as material texture', async () => {
		const runtime = createWebGpuRuntime();
		const { PingPongShaderPass } = await import('../../lib/passes/PingPongShaderPass');
		const pass = new PingPongShaderPass({
			target: 'fluid',
			width: 8,
			height: 8,
			format: 'rgba16float',
			iterations: 2,
			fragment: [
				'fn frag(uv: vec2f) -> vec4f {',
				'\tlet previous = textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);',
				'\treturn previous + vec4f(0.01, 0.0, 0.0, 0.0);',
				'}'
			].join('\n')
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['fluid'],
			textureDefinitions: {
				fluid: { filter: 'linear' }
			},
			passes: [pass as unknown as RenderPass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const encoder = runtime.commandEncoders[0];
		expect(encoder).toBeDefined();
		expect(encoder?.copyTextureToTexture).not.toHaveBeenCalled();
		expect(encoder?.beginComputePass).not.toHaveBeenCalled();
		expect(encoder?.beginRenderPass.mock.calls.length).toBeGreaterThanOrEqual(3);

		const renderPassDescriptors = encoder?.beginRenderPass.mock.calls.map(
			(call) => call[0] as GPURenderPassDescriptor
		);
		const feedbackDescriptorIndex =
			renderPassDescriptors?.findIndex((descriptor) => {
				const attachment = Array.from(descriptor.colorAttachments ?? [])[0];
				const size = (attachment?.view as unknown as { textureDescriptor?: GPUTextureDescriptor })
					?.textureDescriptor?.size as { width?: number; height?: number } | undefined;
				return size?.width === 8 && size.height === 8;
			}) ?? -1;
		const sceneDescriptorIndex =
			renderPassDescriptors?.findIndex((descriptor) => {
				const attachment = Array.from(descriptor.colorAttachments ?? [])[0];
				const size = (attachment?.view as unknown as { textureDescriptor?: GPUTextureDescriptor })
					?.textureDescriptor?.size as { width?: number; height?: number } | undefined;
				return size?.width === 10 && size.height === 10;
			}) ?? -1;

		expect(feedbackDescriptorIndex).toBeGreaterThanOrEqual(0);
		expect(sceneDescriptorIndex).toBeGreaterThan(feedbackDescriptorIndex);

		const fragmentTextureBindGroups = runtime.device.createBindGroup.mock.calls
			.map((call) => call[0] as { entries?: Array<{ resource?: unknown }> })
			.filter((descriptor) => {
				const entries = descriptor.entries ?? [];
				return (
					entries.length > 2 &&
					entries.some((entry) => {
						const size = (
							entry.resource as { textureDescriptor?: GPUTextureDescriptor } | undefined
						)?.textureDescriptor?.size as { width?: number; height?: number } | undefined;
						return size?.width === 8 && size.height === 8;
					})
				);
			});
		expect(fragmentTextureBindGroups.length).toBeGreaterThan(0);

		renderer.destroy();
	});

	it('excludes the ping-pong shader target from the feedback material bind group', async () => {
		const runtime = createWebGpuRuntime();
		const { PingPongShaderPass } = await import('../../lib/passes/PingPongShaderPass');
		const pass = new PingPongShaderPass({
			target: 'fluid',
			width: 8,
			height: 8,
			format: 'rgba16float',
			fragment: [
				'fn frag(uv: vec2f) -> vec4f {',
				'\tlet previous = textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);',
				'\tlet maskColor = textureSampleLevel(mask, maskSampler, uv, 0.0);',
				'\treturn previous + maskColor;',
				'}'
			].join('\n')
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['fluid', 'mask'],
			textureDefinitions: {
				fluid: { filter: 'linear' },
				mask: { filter: 'linear' }
			},
			passes: [pass as unknown as RenderPass]
		});

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		const bindGroupDescriptors = runtime.device.createBindGroup.mock.calls.map(
			(call) => call[0] as { entries?: Array<{ binding: number }> }
		);
		const feedbackBindGroup = bindGroupDescriptors.find((descriptor) => {
			const entries = descriptor.entries ?? [];
			return entries.length === 4 && entries.some((entry) => entry.binding === 3);
		});
		expect(feedbackBindGroup?.entries?.map((entry) => entry.binding)).toEqual([0, 1, 2, 3]);
		expect(
			bindGroupDescriptors.some((descriptor) => {
				const entries = descriptor.entries ?? [];
				return entries.length === 6 && entries.some((entry) => entry.binding === 5);
			})
		).toBe(true);

		renderer.destroy();
	});

	it('rejects storage textures as ping-pong shader targets', async () => {
		const runtime = createWebGpuRuntime();
		const { PingPongShaderPass } = await import('../../lib/passes/PingPongShaderPass');
		const pass = new PingPongShaderPass({
			target: 'fluid',
			width: 8,
			height: 8,
			format: 'rgba16float',
			fragment: [
				'fn frag(uv: vec2f) -> vec4f {',
				'\treturn textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);',
				'}'
			].join('\n')
		});
		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['fluid'],
			textureDefinitions: {
				fluid: { storage: true, format: 'rgba16float', width: 8, height: 8 }
			},
			storageTextureKeys: ['fluid'],
			passes: [pass as unknown as RenderPass]
		});

		expect(() =>
			renderer.render({
				time: 0,
				delta: 0.016,
				renderMode: 'always',
				uniforms: {},
				textures: {}
			})
		).toThrow(/sampled texture, not storage:true/);

		renderer.destroy();
	});

	it('does not create compute pipeline when no compute passes exist', async () => {
		const runtime = createWebGpuRuntime();
		const renderer = await createRenderer(baseOptions(runtime));

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(runtime.device.createComputePipeline).not.toHaveBeenCalled();

		renderer.destroy();
	});

	it('honours explicit TextureDefinition.format when uploading source textures', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 16;
		source.height = 16;

		const renderer = await createRenderer({
			...baseOptions(runtime),
			textureKeys: ['uPhoto'],
			textureDefinitions: {
				uPhoto: { colorSpace: 'linear', format: 'rgba16float' }
			}
		});

		const fallbackAllocations = runtime.device.createTexture.mock.calls
			.map(([descriptor]) => descriptor as GPUTextureDescriptor)
			.filter((descriptor) => {
				const size = descriptor.size as { width?: number; height?: number };
				return size.width === 1 && size.height === 1;
			});
		expect(fallbackAllocations.some((descriptor) => descriptor.format === 'rgba8unorm')).toBe(true);
		expect(fallbackAllocations.some((descriptor) => descriptor.format === 'rgba16float')).toBe(
			false
		);

		runtime.device.createTexture.mockClear();

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: { uPhoto: source }
		});

		const sizedAllocations = runtime.device.createTexture.mock.calls
			.map(([descriptor]) => descriptor as GPUTextureDescriptor)
			.filter((descriptor) => {
				const size = descriptor.size as { width?: number; height?: number };
				return size.width === 16 && size.height === 16;
			});
		expect(sizedAllocations.length).toBeGreaterThan(0);
		for (const descriptor of sizedAllocations) {
			expect(descriptor.format).toBe('rgba16float');
		}

		renderer.destroy();
	});
});
