import { afterEach, describe, expect, it, vi } from 'vitest';
import { getShaderCompilationDiagnostics } from '../../lib/core/error-diagnostics';
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
		createComputePipeline: ReturnType<typeof vi.fn>;
		createBuffer: ReturnType<typeof vi.fn>;
		createBindGroup: ReturnType<typeof vi.fn>;
		createCommandEncoder: ReturnType<typeof vi.fn>;
		addEventListener: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		lost: Promise<{ reason?: string; message?: string }>;
	};
	textures: MockTexture[];
	buffers: Array<{ destroy: ReturnType<typeof vi.fn>; descriptor: GPUBufferDescriptor }>;
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
	const computePasses: MockWebGpuRuntime['computePasses'] = [];
	const commandEncoders: MockWebGpuRuntime['commandEncoders'] = [];
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
			computePasses.push(computePass);
			const encoder = {
				copyTextureToTexture: vi.fn(),
				copyBufferToBuffer: vi.fn(),
				beginRenderPass: vi.fn(() => pass as unknown as GPURenderPassEncoder),
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
		const secondPassAttachment = Array.from(beginDescriptors[3]?.colorAttachments ?? [])[0];
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

	it('fails mipmap upload when no 2d context is available for generated levels', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 8;
		source.height = 8;

		vi.stubGlobal(
			'OffscreenCanvas',
			class {
				width: number;
				height: number;

				constructor(width: number, height: number) {
					this.width = width;
					this.height = height;
				}

				getContext(): null {
					return null;
				}
			}
		);

		await expect(
			createRenderer({
				...baseOptions(runtime),
				textureKeys: ['uTex'],
				textureDefinitions: {
					uTex: {
						source,
						generateMipmaps: true
					}
				}
			})
		).rejects.toThrow(/Unable to create 2D context for mipmap generation/);
		expect(runtime.textures.length).toBeGreaterThan(0);
		expect(runtime.textures.every((texture) => texture.destroy.mock.calls.length > 0)).toBe(true);
		expect(runtime.buffers.length).toBeGreaterThan(0);
		expect(runtime.buffers.every((buffer) => buffer.destroy.mock.calls.length > 0)).toBe(true);
		expect(runtime.device.removeEventListener).toHaveBeenCalledWith(
			'uncapturederror',
			expect.any(Function)
		);
	});

	it('uses DOM canvas fallback for mipmap generation when OffscreenCanvas is unavailable', async () => {
		const runtime = createWebGpuRuntime();
		const source = document.createElement('canvas');
		source.width = 8;
		source.height = 8;
		const drawImage = vi.fn();
		const originalCreateElement = document.createElement.bind(document);
		const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((
			tagName: string
		) => {
			if (tagName === 'canvas') {
				return {
					width: 0,
					height: 0,
					getContext: vi.fn((kind: string) =>
						kind === '2d'
							? ({
									drawImage
								} as unknown as CanvasRenderingContext2D)
							: null
					)
				} as unknown as HTMLCanvasElement;
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

		expect(createElementSpy).toHaveBeenCalledWith('canvas');
		expect(drawImage).toHaveBeenCalled();
		expect(runtime.device.queue.copyExternalImageToTexture.mock.calls.length).toBeGreaterThan(1);
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
		expect(runtime.device.createBindGroup.mock.calls.length).toBe(bindGroupCallsBeforeRender);
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

		renderer.render({
			time: 0,
			delta: 0.016,
			renderMode: 'always',
			uniforms: {},
			textures: {}
		});

		expect(runtime.device.createComputePipeline).toHaveBeenCalled();
		expect(runtime.device.queue.submit).toHaveBeenCalledTimes(1);

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
});
