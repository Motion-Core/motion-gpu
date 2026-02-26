import { buildShaderSource } from './shader';
import { packUniforms } from './uniforms';
import type { Renderer, RendererOptions } from './types';

function resizeCanvas(canvas: HTMLCanvasElement): { width: number; height: number } {
	const dpr = Math.max(1, window.devicePixelRatio || 1);
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

export async function createRenderer(options: RendererOptions): Promise<Renderer> {
	if (!navigator.gpu) {
		throw new Error('WebGPU is not available in this browser');
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error('Unable to acquire WebGPU adapter');
	}

	const device = await adapter.requestDevice();
	const context = options.canvas.getContext('webgpu') as GPUCanvasContext | null;
	if (!context) {
		throw new Error('Canvas does not support webgpu context');
	}

	const format = navigator.gpu.getPreferredCanvasFormat();
	const shaderSource = buildShaderSource(options.fragmentWgsl, options.uniformKeys);
	const shaderModule = device.createShaderModule({ code: shaderSource });
	await assertCompilation(shaderModule);

	const pipeline = device.createRenderPipeline({
		layout: 'auto',
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

	const frameBuffer = device.createBuffer({
		size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});

	const uniformBuffer = device.createBuffer({
		size: Math.max(16, options.uniformKeys.length * 16),
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});

	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: frameBuffer } },
			{ binding: 1, resource: { buffer: uniformBuffer } }
		]
	});

	const render: Renderer['render'] = ({ time, delta, uniforms }) => {
		const { width, height } = resizeCanvas(options.canvas);

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

		const uniformData = packUniforms(uniforms, options.uniformKeys);
		device.queue.writeBuffer(
			uniformBuffer,
			0,
			uniformData.buffer as ArrayBuffer,
			uniformData.byteOffset,
			uniformData.byteLength
		);

		const commandEncoder = device.createCommandEncoder();
		const pass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: context.getCurrentTexture().createView(),
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

		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();

		device.queue.submit([commandEncoder.finish()]);
	};

	return {
		render,
		destroy: () => {
			frameBuffer.destroy();
			uniformBuffer.destroy();
		}
	};
}
