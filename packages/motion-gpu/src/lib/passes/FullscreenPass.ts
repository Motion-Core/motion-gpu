import type {
	RenderPass,
	RenderPassContext,
	RenderPassFlags,
	RenderPassInputSlot,
	RenderPassOutputSlot
} from '../core/types.js';
import { resolveTextureSamplingLayout } from '../core/textures.js';

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
	private readonly samplerBySamplingLayout = new Map<string, GPUSampler>();
	private readonly bindGroupLayoutBySamplingLayout = new Map<string, GPUBindGroupLayout>();
	private shaderModule: GPUShaderModule | null = null;
	private readonly pipelineByFormat = new Map<string, GPURenderPipeline>();
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
		this.samplerBySamplingLayout.clear();
		this.bindGroupLayoutBySamplingLayout.clear();
		this.bindGroupByView = new WeakMap();
	}

	private ensureResources(
		device: GPUDevice,
		inputFormat: GPUTextureFormat,
		outputFormat: GPUTextureFormat
	): {
		sampler: GPUSampler;
		bindGroupLayout: GPUBindGroupLayout;
		pipeline: GPURenderPipeline;
	} {
		if (this.device !== device) {
			this.device = device;
			this.invalidateFullscreenCache();
		}

		const samplingLayout = resolveTextureSamplingLayout({
			format: inputFormat,
			filter: this.filter,
			deviceFeatures: device.features
		});
		const samplingLayoutKey = [
			inputFormat,
			samplingLayout.sampleType,
			samplingLayout.samplerType,
			samplingLayout.effectiveFilter
		].join('|');

		let sampler = this.samplerBySamplingLayout.get(samplingLayoutKey);
		if (!sampler) {
			sampler = device.createSampler({
				magFilter: samplingLayout.effectiveFilter,
				minFilter: samplingLayout.effectiveFilter,
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});
			this.samplerBySamplingLayout.set(samplingLayoutKey, sampler);
		}

		let bindGroupLayout = this.bindGroupLayoutBySamplingLayout.get(samplingLayoutKey);
		if (!bindGroupLayout) {
			bindGroupLayout = device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: { type: samplingLayout.samplerType }
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						texture: {
							sampleType: samplingLayout.sampleType,
							viewDimension: '2d',
							multisampled: false
						}
					}
				]
			});
			this.bindGroupLayoutBySamplingLayout.set(samplingLayoutKey, bindGroupLayout);
		}

		if (!this.shaderModule) {
			this.shaderModule = device.createShaderModule({ code: this.getProgram() });
		}

		const pipelineKey = `${outputFormat}|${samplingLayoutKey}`;
		let pipeline = this.pipelineByFormat.get(pipelineKey);
		if (!pipeline) {
			const pipelineLayout = device.createPipelineLayout({
				bindGroupLayouts: [bindGroupLayout]
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
					targets: [{ format: outputFormat }]
				},
				primitive: { topology: 'triangle-list' }
			});
			this.pipelineByFormat.set(pipelineKey, pipeline);
		}

		return {
			sampler,
			bindGroupLayout,
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
			context.input.format,
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
		this.invalidateFullscreenCache();
	}
}
