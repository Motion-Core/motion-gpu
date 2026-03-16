import type {
	RenderPass,
	RenderPassContext,
	RenderPassFlags,
	RenderPassInputSlot,
	RenderPassOutputSlot
} from '../core/types.js';

export interface FullscreenPassOptions extends RenderPassFlags {
	enabled?: boolean;
	needsSwap?: boolean;
	input?: RenderPassInputSlot;
	output?: RenderPassOutputSlot;
	filter?: GPUFilterMode;
}

/**
 * Shared base for fullscreen texture sampling passes.
 */
export abstract class FullscreenPass implements RenderPass {
	enabled: boolean;
	needsSwap: boolean;
	input: RenderPassInputSlot;
	output: RenderPassOutputSlot;
	clear: boolean;
	clearColor: [number, number, number, number];
	preserve: boolean;
	private readonly filter: GPUFilterMode;
	private device: GPUDevice | null = null;
	private sampler: GPUSampler | null = null;
	private bindGroupLayout: GPUBindGroupLayout | null = null;
	private shaderModule: GPUShaderModule | null = null;
	private readonly pipelineByFormat = new Map<GPUTextureFormat, GPURenderPipeline>();
	private bindGroupByView = new WeakMap<GPUTextureView, GPUBindGroup>();

	protected constructor(options: FullscreenPassOptions = {}) {
		this.enabled = options.enabled ?? true;
		this.needsSwap = options.needsSwap ?? true;
		this.input = options.input ?? 'source';
		this.output = options.output ?? (this.needsSwap ? 'target' : 'source');
		this.clear = options.clear ?? false;
		this.clearColor = options.clearColor ?? [0, 0, 0, 1];
		this.preserve = options.preserve ?? true;
		this.filter = options.filter ?? 'linear';
	}

	protected abstract getProgram(): string;
	protected abstract getVertexEntryPoint(): string;
	protected abstract getFragmentEntryPoint(): string;

	protected invalidateFullscreenCache(): void {
		this.shaderModule = null;
		this.pipelineByFormat.clear();
		this.bindGroupByView = new WeakMap();
	}

	private ensureResources(
		device: GPUDevice,
		format: GPUTextureFormat
	): {
		sampler: GPUSampler;
		bindGroupLayout: GPUBindGroupLayout;
		pipeline: GPURenderPipeline;
	} {
		if (this.device !== device) {
			this.device = device;
			this.sampler = null;
			this.bindGroupLayout = null;
			this.invalidateFullscreenCache();
		}

		if (!this.sampler) {
			this.sampler = device.createSampler({
				magFilter: this.filter,
				minFilter: this.filter,
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});
		}

		if (!this.bindGroupLayout) {
			this.bindGroupLayout = device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: { type: 'filtering' }
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						texture: {
							sampleType: 'float',
							viewDimension: '2d',
							multisampled: false
						}
					}
				]
			});
		}

		if (!this.shaderModule) {
			this.shaderModule = device.createShaderModule({ code: this.getProgram() });
		}

		let pipeline = this.pipelineByFormat.get(format);
		if (!pipeline) {
			const pipelineLayout = device.createPipelineLayout({
				bindGroupLayouts: [this.bindGroupLayout]
			});
			pipeline = device.createRenderPipeline({
				layout: pipelineLayout,
				vertex: {
					module: this.shaderModule,
					entryPoint: this.getVertexEntryPoint()
				},
				fragment: {
					module: this.shaderModule,
					entryPoint: this.getFragmentEntryPoint(),
					targets: [{ format }]
				},
				primitive: { topology: 'triangle-list' }
			});
			this.pipelineByFormat.set(format, pipeline);
		}

		return {
			sampler: this.sampler,
			bindGroupLayout: this.bindGroupLayout,
			pipeline
		};
	}

	setSize(width: number, height: number): void {
		void width;
		void height;
	}

	protected renderFullscreen(context: RenderPassContext): void {
		const { sampler, bindGroupLayout, pipeline } = this.ensureResources(
			context.device,
			context.output.format
		);
		const inputView = context.input.view;
		let bindGroup = this.bindGroupByView.get(inputView);
		if (!bindGroup) {
			bindGroup = context.device.createBindGroup({
				layout: bindGroupLayout,
				entries: [
					{ binding: 0, resource: sampler },
					{ binding: 1, resource: inputView }
				]
			});
			this.bindGroupByView.set(inputView, bindGroup);
		}
		const pass = context.beginRenderPass();
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
	}

	render(context: RenderPassContext): void {
		this.renderFullscreen(context);
	}

	dispose(): void {
		this.device = null;
		this.sampler = null;
		this.bindGroupLayout = null;
		this.invalidateFullscreenCache();
	}
}
