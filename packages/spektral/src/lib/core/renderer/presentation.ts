import {
	buildPresentationShader,
	shouldConvertLinearToSrgb,
	type EffectiveDynamicRange,
	type ResolvedColorPipeline
} from '../color-pipeline.js';

export function toClearValue(color: [number, number, number, number]): GPUColorDict {
	return { r: color[0], g: color[1], b: color[2], a: color[3] };
}

export function toPremultipliedCanvasClearValue(
	color: [number, number, number, number]
): GPUColorDict {
	const alpha = Math.min(Math.max(color[3], 0), 1);
	return { r: color[0] * alpha, g: color[1] * alpha, b: color[2] * alpha, a: alpha };
}

export function buildPresentationPipelineKey(
	canvasFormat: GPUTextureFormat,
	dynamicRange: EffectiveDynamicRange,
	applyFinalTransform: boolean,
	premultiplyAlpha: boolean
): string {
	return `${canvasFormat}|${dynamicRange}|${applyFinalTransform}|${premultiplyAlpha}`;
}

export async function createPresentationPipeline(input: {
	device: GPUDevice;
	pipelineLayout: GPUPipelineLayout;
	pipelines: Map<string, GPURenderPipeline>;
	colorPipeline: ResolvedColorPipeline;
	canvasFormat: GPUTextureFormat;
	dynamicRange: EffectiveDynamicRange;
	applyFinalTransform: boolean;
	premultiplyAlpha: boolean;
	assertCompilation: (module: GPUShaderModule) => Promise<void>;
}): Promise<void> {
	const key = buildPresentationPipelineKey(
		input.canvasFormat,
		input.dynamicRange,
		input.applyFinalTransform,
		input.premultiplyAlpha
	);
	if (input.pipelines.has(key)) return;
	const convertPresentationLinearToSrgb =
		input.applyFinalTransform &&
		shouldConvertLinearToSrgb(
			input.colorPipeline.outputEncoding,
			input.canvasFormat,
			input.dynamicRange
		);
	const shaderModule = input.device.createShaderModule({
		code: buildPresentationShader({
			toneMapping: input.applyFinalTransform ? input.colorPipeline.toneMapping : 'none',
			convertLinearToSrgb: convertPresentationLinearToSrgb,
			dynamicRange: input.dynamicRange,
			premultiplyAlpha: input.premultiplyAlpha
		})
	});
	await input.assertCompilation(shaderModule);
	input.pipelines.set(
		key,
		input.device.createRenderPipeline({
			layout: input.pipelineLayout,
			vertex: { module: shaderModule, entryPoint: 'spektralPresentationVertex' },
			fragment: {
				module: shaderModule,
				entryPoint: 'spektralPresentationFragment',
				targets: [{ format: input.canvasFormat }]
			},
			primitive: { topology: 'triangle-list' }
		})
	);
}

export function presentToCanvas(input: {
	device: GPUDevice;
	commandEncoder: GPUCommandEncoder;
	sourceView: GPUTextureView;
	canvasView: GPUTextureView;
	clearColor: [number, number, number, number];
	applyFinalTransform: boolean;
	canvasFormat: GPUTextureFormat;
	dynamicRange: EffectiveDynamicRange;
	pipelines: ReadonlyMap<string, GPURenderPipeline>;
	bindGroupLayout: GPUBindGroupLayout;
	sampler: GPUSampler;
	bindGroups: WeakMap<GPUTextureView, GPUBindGroup>;
}): void {
	let bindGroup = input.bindGroups.get(input.sourceView);
	if (!bindGroup) {
		bindGroup = input.device.createBindGroup({
			layout: input.bindGroupLayout,
			entries: [
				{ binding: 0, resource: input.sampler },
				{ binding: 1, resource: input.sourceView }
			]
		});
		input.bindGroups.set(input.sourceView, bindGroup);
	}
	const pass = input.commandEncoder.beginRenderPass({
		colorAttachments: [
			{
				view: input.canvasView,
				clearValue: toPremultipliedCanvasClearValue(input.clearColor),
				loadOp: 'clear',
				storeOp: 'store'
			}
		]
	});
	const pipeline = input.pipelines.get(
		buildPresentationPipelineKey(
			input.canvasFormat,
			input.dynamicRange,
			input.applyFinalTransform,
			true
		)
	);
	if (!pipeline) {
		throw new Error(
			`Missing presentation pipeline for ${input.canvasFormat}/${input.dynamicRange}.`
		);
	}
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.draw(3);
	pass.end();
}
