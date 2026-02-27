import { buildRenderTargetSignature, resolveRenderTargetDefinitions } from './render-targets';
import { buildShaderSource } from './shader';
import {
	getTextureMipLevelCount,
	isVideoTextureSource,
	normalizeTextureDefinitions,
	resolveTextureSize,
	toTextureData
} from './textures';
import { packUniformsInto } from './uniforms';
import type {
	RenderPass,
	RenderTarget,
	Renderer,
	RendererOptions,
	TextureSource,
	TextureValue
} from './types';

const FRAME_BINDING = 0;
const UNIFORM_BINDING = 1;
const FIRST_TEXTURE_BINDING = 2;

interface RuntimeTextureBinding {
	key: string;
	samplerBinding: number;
	textureBinding: number;
	sampler: GPUSampler;
	fallbackTexture: GPUTexture;
	fallbackView: GPUTextureView;
	texture: GPUTexture | null;
	view: GPUTextureView;
	source: TextureSource | null;
	width: number | undefined;
	height: number | undefined;
	mipLevelCount: number;
	format: GPUTextureFormat;
	flipY: boolean;
	generateMipmaps: boolean;
	premultipliedAlpha: boolean;
}

interface RuntimeRenderTarget {
	texture: GPUTexture;
	view: GPUTextureView;
	width: number;
	height: number;
	format: GPUTextureFormat;
}

function getTextureBindings(index: number): { samplerBinding: number; textureBinding: number } {
	const samplerBinding = FIRST_TEXTURE_BINDING + index * 2;
	return {
		samplerBinding,
		textureBinding: samplerBinding + 1
	};
}

function resizeCanvas(
	canvas: HTMLCanvasElement,
	dprInput: number
): { width: number; height: number } {
	const dpr = Math.max(1, dprInput || 1);
	const width = Math.max(1, Math.floor((canvas.clientWidth || canvas.width || 1) * dpr));
	const height = Math.max(1, Math.floor((canvas.clientHeight || canvas.height || 1) * dpr));

	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	return { width, height };
}

async function assertCompilation(module: GPUShaderModule): Promise<void> {
	const info = await module.getCompilationInfo();
	const errors = info.messages.filter((message: GPUCompilationMessage) => message.type === 'error');

	if (errors.length === 0) {
		return;
	}

	const summary = errors
		.map((message: GPUCompilationMessage) => `line ${message.lineNum}: ${message.message}`)
		.join('\n');
	throw new Error(`WGSL compilation failed:\n${summary}`);
}

function createFallbackTexture(device: GPUDevice, format: GPUTextureFormat): GPUTexture {
	const texture = device.createTexture({
		size: { width: 1, height: 1, depthOrArrayLayers: 1 },
		format,
		usage:
			GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
	});

	const pixel = new Uint8Array([255, 255, 255, 255]);
	device.queue.writeTexture(
		{ texture },
		pixel,
		{ offset: 0, bytesPerRow: 4, rowsPerImage: 1 },
		{ width: 1, height: 1, depthOrArrayLayers: 1 }
	);

	return texture;
}

function createMipmapCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
	if (typeof OffscreenCanvas !== 'undefined') {
		return new OffscreenCanvas(width, height);
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function createExternalCopySource(
	source: CanvasImageSource,
	options: { flipY?: boolean; premultipliedAlpha?: boolean }
): GPUCopyExternalImageSourceInfo {
	const descriptor = {
		source,
		...(options.flipY ? { flipY: true } : {}),
		...(options.premultipliedAlpha ? { premultipliedAlpha: true } : {})
	};

	return descriptor as GPUCopyExternalImageSourceInfo;
}

function uploadTexture(
	device: GPUDevice,
	texture: GPUTexture,
	binding: Pick<RuntimeTextureBinding, 'flipY' | 'premultipliedAlpha' | 'generateMipmaps'>,
	source: TextureSource,
	width: number,
	height: number,
	mipLevelCount: number
): void {
	device.queue.copyExternalImageToTexture(
		createExternalCopySource(source, {
			flipY: binding.flipY,
			premultipliedAlpha: binding.premultipliedAlpha
		}),
		{ texture, mipLevel: 0 },
		{ width, height, depthOrArrayLayers: 1 }
	);

	if (!binding.generateMipmaps || mipLevelCount <= 1) {
		return;
	}

	let previousSource: CanvasImageSource = source;
	let previousWidth = width;
	let previousHeight = height;

	for (let level = 1; level < mipLevelCount; level += 1) {
		const nextWidth = Math.max(1, Math.floor(previousWidth / 2));
		const nextHeight = Math.max(1, Math.floor(previousHeight / 2));
		const canvas = createMipmapCanvas(nextWidth, nextHeight);
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Unable to create 2D context for mipmap generation');
		}

		context.drawImage(
			previousSource,
			0,
			0,
			previousWidth,
			previousHeight,
			0,
			0,
			nextWidth,
			nextHeight
		);

		device.queue.copyExternalImageToTexture(
			createExternalCopySource(canvas, {
				premultipliedAlpha: binding.premultipliedAlpha
			}),
			{ texture, mipLevel: level },
			{ width: nextWidth, height: nextHeight, depthOrArrayLayers: 1 }
		);

		previousSource = canvas;
		previousWidth = nextWidth;
		previousHeight = nextHeight;
	}
}

function createBindGroupLayoutEntries(
	textureBindings: RuntimeTextureBinding[]
): GPUBindGroupLayoutEntry[] {
	const entries: GPUBindGroupLayoutEntry[] = [
		{
			binding: FRAME_BINDING,
			visibility: GPUShaderStage.FRAGMENT,
			buffer: { type: 'uniform', minBindingSize: 16 }
		},
		{
			binding: UNIFORM_BINDING,
			visibility: GPUShaderStage.FRAGMENT,
			buffer: { type: 'uniform' }
		}
	];

	for (const binding of textureBindings) {
		entries.push({
			binding: binding.samplerBinding,
			visibility: GPUShaderStage.FRAGMENT,
			sampler: { type: 'filtering' }
		});

		entries.push({
			binding: binding.textureBinding,
			visibility: GPUShaderStage.FRAGMENT,
			texture: { sampleType: 'float', viewDimension: '2d', multisampled: false }
		});
	}

	return entries;
}

function findDirtyFloatRanges(
	previous: Float32Array,
	next: Float32Array
): Array<{ start: number; count: number }> {
	const ranges: Array<{ start: number; count: number }> = [];
	let start = -1;

	for (let index = 0; index < next.length; index += 1) {
		if (previous[index] !== next[index]) {
			if (start === -1) {
				start = index;
			}
			continue;
		}

		if (start !== -1) {
			ranges.push({ start, count: index - start });
			start = -1;
		}
	}

	if (start !== -1) {
		ranges.push({ start, count: next.length - start });
	}

	return ranges;
}

function shouldConvertLinearToSrgb(
	outputColorSpace: 'srgb' | 'linear',
	canvasFormat: GPUTextureFormat
): boolean {
	if (outputColorSpace !== 'srgb') {
		return false;
	}

	return !canvasFormat.endsWith('-srgb');
}

function createFullscreenBlitShader(): string {
	return `
struct FragkitVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@group(0) @binding(0) var fragkitBlitSampler: sampler;
@group(0) @binding(1) var fragkitBlitTexture: texture_2d<f32>;

@vertex
fn fragkitBlitVertex(@builtin(vertex_index) index: u32) -> FragkitVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: FragkitVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = (position + vec2f(1.0, 1.0)) * 0.5;
	return out;
}

@fragment
fn fragkitBlitFragment(in: FragkitVertexOut) -> @location(0) vec4f {
	return textureSample(fragkitBlitTexture, fragkitBlitSampler, in.uv);
}
`;
}

function createRenderTexture(
	device: GPUDevice,
	width: number,
	height: number,
	format: GPUTextureFormat
): RuntimeRenderTarget {
	const texture = device.createTexture({
		size: { width, height, depthOrArrayLayers: 1 },
		format,
		usage:
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.RENDER_ATTACHMENT |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.COPY_SRC
	});

	return {
		texture,
		view: texture.createView(),
		width,
		height,
		format
	};
}

function destroyRenderTexture(target: RuntimeRenderTarget | null): void {
	target?.texture.destroy();
}

export async function createRenderer(options: RendererOptions): Promise<Renderer> {
	if (!navigator.gpu) {
		throw new Error('WebGPU is not available in this browser');
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error('Unable to acquire WebGPU adapter');
	}

	const device = await adapter.requestDevice();
	let isDestroyed = false;
	let deviceLostMessage: string | null = null;
	let uncapturedErrorMessage: string | null = null;

	void device.lost.then((info) => {
		if (isDestroyed) {
			return;
		}

		const reason = info.reason ? ` (${info.reason})` : '';
		const details = info.message?.trim();
		deviceLostMessage = details
			? `WebGPU device lost: ${details}${reason}`
			: `WebGPU device lost${reason}`;
	});

	const handleUncapturedError = (event: GPUUncapturedErrorEvent): void => {
		if (isDestroyed) {
			return;
		}

		const message =
			event.error instanceof Error
				? event.error.message
				: String((event.error as { message?: string })?.message ?? event.error);
		uncapturedErrorMessage = `WebGPU uncaptured error: ${message}`;
	};

	device.addEventListener('uncapturederror', handleUncapturedError);
	const context = options.canvas.getContext('webgpu') as GPUCanvasContext | null;
	if (!context) {
		throw new Error('Canvas does not support webgpu context');
	}

	const format = navigator.gpu.getPreferredCanvasFormat();
	const convertLinearToSrgb = shouldConvertLinearToSrgb(options.outputColorSpace, format);
	const shaderSource = buildShaderSource(
		options.fragmentWgsl,
		options.uniformLayout,
		options.textureKeys,
		{ convertLinearToSrgb }
	);
	const shaderModule = device.createShaderModule({ code: shaderSource });
	await assertCompilation(shaderModule);

	const normalizedTextureDefinitions = normalizeTextureDefinitions(
		options.textureDefinitions,
		options.textureKeys
	);
	const textureBindings = options.textureKeys.map((key, index): RuntimeTextureBinding => {
		const config = normalizedTextureDefinitions[key];
		const { samplerBinding, textureBinding } = getTextureBindings(index);
		const sampler = device.createSampler({
			magFilter: config.filter,
			minFilter: config.filter,
			mipmapFilter: config.generateMipmaps ? config.filter : 'nearest',
			addressModeU: config.addressModeU,
			addressModeV: config.addressModeV,
			maxAnisotropy: config.filter === 'linear' ? config.anisotropy : 1
		});
		const fallbackTexture = createFallbackTexture(device, config.format);
		const fallbackView = fallbackTexture.createView();

		return {
			key,
			samplerBinding,
			textureBinding,
			sampler,
			fallbackTexture,
			fallbackView,
			texture: null,
			view: fallbackView,
			source: null,
			width: undefined,
			height: undefined,
			mipLevelCount: 1,
			format: config.format,
			flipY: config.flipY,
			generateMipmaps: config.generateMipmaps,
			premultipliedAlpha: config.premultipliedAlpha
		};
	});

	const bindGroupLayout = device.createBindGroupLayout({
		entries: createBindGroupLayoutEntries(textureBindings)
	});
	const pipelineLayout = device.createPipelineLayout({
		bindGroupLayouts: [bindGroupLayout]
	});

	const pipeline = device.createRenderPipeline({
		layout: pipelineLayout,
		vertex: {
			module: shaderModule,
			entryPoint: 'fragkitVertex'
		},
		fragment: {
			module: shaderModule,
			entryPoint: 'fragkitFragment',
			targets: [{ format }]
		},
		primitive: {
			topology: 'triangle-list'
		}
	});

	const blitShaderModule = device.createShaderModule({ code: createFullscreenBlitShader() });
	await assertCompilation(blitShaderModule);

	const blitBindGroupLayout = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
			{
				binding: 1,
				visibility: GPUShaderStage.FRAGMENT,
				texture: { sampleType: 'float', viewDimension: '2d', multisampled: false }
			}
		]
	});
	const blitPipelineLayout = device.createPipelineLayout({
		bindGroupLayouts: [blitBindGroupLayout]
	});
	const blitPipeline = device.createRenderPipeline({
		layout: blitPipelineLayout,
		vertex: { module: blitShaderModule, entryPoint: 'fragkitBlitVertex' },
		fragment: {
			module: blitShaderModule,
			entryPoint: 'fragkitBlitFragment',
			targets: [{ format }]
		},
		primitive: {
			topology: 'triangle-list'
		}
	});
	const blitSampler = device.createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const frameBuffer = device.createBuffer({
		size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});

	const uniformBuffer = device.createBuffer({
		size: options.uniformLayout.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	const uniformScratch = new Float32Array(options.uniformLayout.byteLength / 4);
	const uniformPrevious = new Float32Array(options.uniformLayout.byteLength / 4);
	let hasUniformSnapshot = false;

	const createBindGroup = (): GPUBindGroup => {
		const entries: GPUBindGroupEntry[] = [
			{ binding: FRAME_BINDING, resource: { buffer: frameBuffer } },
			{ binding: UNIFORM_BINDING, resource: { buffer: uniformBuffer } }
		];

		for (const binding of textureBindings) {
			entries.push({
				binding: binding.samplerBinding,
				resource: binding.sampler
			});
			entries.push({
				binding: binding.textureBinding,
				resource: binding.view
			});
		}

		return device.createBindGroup({
			layout: bindGroupLayout,
			entries
		});
	};

	const updateTextureBinding = (binding: RuntimeTextureBinding, value: TextureValue): boolean => {
		const nextData = toTextureData(value);

		if (!nextData) {
			if (binding.source === null && binding.texture === null) {
				return false;
			}

			binding.texture?.destroy();
			binding.texture = null;
			binding.view = binding.fallbackView;
			binding.source = null;
			binding.width = undefined;
			binding.height = undefined;
			return true;
		}

		const source = nextData.source;
		const { width, height } = resolveTextureSize(nextData);
		const mipLevelCount = binding.generateMipmaps ? getTextureMipLevelCount(width, height) : 1;

		if (
			binding.source === source &&
			binding.width === width &&
			binding.height === height &&
			binding.mipLevelCount === mipLevelCount
		) {
			if (isVideoTextureSource(source) && binding.texture) {
				uploadTexture(device, binding.texture, binding, source, width, height, mipLevelCount);
			}
			return false;
		}

		const texture = device.createTexture({
			size: { width, height, depthOrArrayLayers: 1 },
			format: binding.format,
			mipLevelCount,
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT
		});

		uploadTexture(device, texture, binding, source, width, height, mipLevelCount);

		binding.texture?.destroy();
		binding.texture = texture;
		binding.view = texture.createView();
		binding.source = source;
		binding.width = width;
		binding.height = height;
		binding.mipLevelCount = mipLevelCount;
		return true;
	};

	for (const binding of textureBindings) {
		const defaultSource = normalizedTextureDefinitions[binding.key]?.source ?? null;
		updateTextureBinding(binding, defaultSource);
	}

	let bindGroup = createBindGroup();
	let sceneTarget: RuntimeRenderTarget | null = null;
	let renderTargetSignature = '';
	const runtimeRenderTargets = new Map<string, RuntimeRenderTarget>();

	const resolvePasses = (): RenderPass[] => {
		return options.getPasses?.() ?? options.passes ?? [];
	};

	const resolveRenderTargets = () => {
		return options.getRenderTargets?.() ?? options.renderTargets;
	};

	const ensureSceneTarget = (width: number, height: number): RuntimeRenderTarget => {
		if (
			sceneTarget &&
			sceneTarget.width === width &&
			sceneTarget.height === height &&
			sceneTarget.format === format
		) {
			return sceneTarget;
		}

		destroyRenderTexture(sceneTarget);
		sceneTarget = createRenderTexture(device, width, height, format);
		return sceneTarget;
	};

	const syncRenderTargets = (
		canvasWidth: number,
		canvasHeight: number
	): Readonly<Record<string, RenderTarget>> => {
		const resolvedDefinitions = resolveRenderTargetDefinitions(
			resolveRenderTargets(),
			canvasWidth,
			canvasHeight,
			format
		);
		const nextSignature = buildRenderTargetSignature(resolvedDefinitions);

		if (nextSignature !== renderTargetSignature) {
			const activeKeys = new Set(resolvedDefinitions.map((definition) => definition.key));

			for (const [key, target] of runtimeRenderTargets.entries()) {
				if (!activeKeys.has(key)) {
					target.texture.destroy();
					runtimeRenderTargets.delete(key);
				}
			}

			for (const definition of resolvedDefinitions) {
				const current = runtimeRenderTargets.get(definition.key);
				if (
					current &&
					current.width === definition.width &&
					current.height === definition.height &&
					current.format === definition.format
				) {
					continue;
				}

				current?.texture.destroy();
				runtimeRenderTargets.set(
					definition.key,
					createRenderTexture(device, definition.width, definition.height, definition.format)
				);
			}

			renderTargetSignature = nextSignature;
		}

		const snapshot: Record<string, RenderTarget> = {};
		for (const [key, target] of runtimeRenderTargets.entries()) {
			snapshot[key] = {
				texture: target.texture,
				view: target.view,
				width: target.width,
				height: target.height,
				format: target.format
			};
		}

		return snapshot;
	};

	const blitToCanvas = (
		commandEncoder: GPUCommandEncoder,
		sourceView: GPUTextureView,
		canvasView: GPUTextureView
	): void => {
		const bindGroup = device.createBindGroup({
			layout: blitBindGroupLayout,
			entries: [
				{ binding: 0, resource: blitSampler },
				{ binding: 1, resource: sourceView }
			]
		});

		const pass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: canvasView,
					clearValue: {
						r: options.clearColor[0],
						g: options.clearColor[1],
						b: options.clearColor[2],
						a: options.clearColor[3]
					},
					loadOp: 'clear',
					storeOp: 'store'
				}
			]
		});

		pass.setPipeline(blitPipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
	};

	const render: Renderer['render'] = ({ time, delta, uniforms, textures }) => {
		if (deviceLostMessage) {
			throw new Error(deviceLostMessage);
		}

		if (uncapturedErrorMessage) {
			const message = uncapturedErrorMessage;
			uncapturedErrorMessage = null;
			throw new Error(message);
		}

		const { width, height } = resizeCanvas(options.canvas, options.getDpr());

		context.configure({
			device,
			format,
			alphaMode: 'premultiplied'
		});

		const frameData = new Float32Array([time, delta, width, height]);
		device.queue.writeBuffer(
			frameBuffer,
			0,
			frameData.buffer as ArrayBuffer,
			frameData.byteOffset,
			frameData.byteLength
		);

		packUniformsInto(uniforms, options.uniformLayout, uniformScratch);
		if (!hasUniformSnapshot) {
			device.queue.writeBuffer(
				uniformBuffer,
				0,
				uniformScratch.buffer as ArrayBuffer,
				uniformScratch.byteOffset,
				uniformScratch.byteLength
			);
			uniformPrevious.set(uniformScratch);
			hasUniformSnapshot = true;
		} else {
			const dirtyRanges = findDirtyFloatRanges(uniformPrevious, uniformScratch);
			for (const range of dirtyRanges) {
				const byteOffset = range.start * 4;
				const byteLength = range.count * 4;
				device.queue.writeBuffer(
					uniformBuffer,
					byteOffset,
					uniformScratch.buffer as ArrayBuffer,
					uniformScratch.byteOffset + byteOffset,
					byteLength
				);
			}

			if (dirtyRanges.length > 0) {
				uniformPrevious.set(uniformScratch);
			}
		}

		let bindGroupDirty = false;
		for (const binding of textureBindings) {
			const nextTexture =
				textures[binding.key] ?? normalizedTextureDefinitions[binding.key]?.source ?? null;
			if (updateTextureBinding(binding, nextTexture)) {
				bindGroupDirty = true;
			}
		}

		if (bindGroupDirty) {
			bindGroup = createBindGroup();
		}

		const commandEncoder = device.createCommandEncoder();
		const canvasView = context.getCurrentTexture().createView();
		const passes = resolvePasses();
		const runtimeTargets = syncRenderTargets(width, height);
		const useOffscreenSource = passes.length > 0;
		const sourceView = useOffscreenSource ? ensureSceneTarget(width, height).view : canvasView;

		const scenePass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: sourceView,
					clearValue: {
						r: options.clearColor[0],
						g: options.clearColor[1],
						b: options.clearColor[2],
						a: options.clearColor[3]
					},
					loadOp: 'clear',
					storeOp: 'store'
				}
			]
		});

		scenePass.setPipeline(pipeline);
		scenePass.setBindGroup(0, bindGroup);
		scenePass.draw(3);
		scenePass.end();

		if (useOffscreenSource) {
			let currentSourceView = sourceView;

			for (const pass of passes) {
				const nextSourceView = pass({
					device,
					commandEncoder,
					sourceView: currentSourceView,
					canvasView,
					targets: runtimeTargets,
					time,
					delta,
					width,
					height
				});

				if (nextSourceView) {
					currentSourceView = nextSourceView;
				}
			}

			if (currentSourceView !== canvasView) {
				blitToCanvas(commandEncoder, currentSourceView, canvasView);
			}
		}

		device.queue.submit([commandEncoder.finish()]);
	};

	return {
		render,
		destroy: () => {
			isDestroyed = true;
			device.removeEventListener('uncapturederror', handleUncapturedError);
			frameBuffer.destroy();
			uniformBuffer.destroy();
			destroyRenderTexture(sceneTarget);
			for (const target of runtimeRenderTargets.values()) {
				target.texture.destroy();
			}
			runtimeRenderTargets.clear();
			for (const binding of textureBindings) {
				binding.texture?.destroy();
				binding.fallbackTexture.destroy();
			}
		}
	};
}
