import {
	assertFloatRenderableFormat,
	assertFloatSampledFormat,
	assertRenderableFormat,
	createFormatCapabilityError
} from './format-capabilities.js';
import { builtInRenderPassBrand } from './pass-brand.js';
import {
	isBuiltInRenderPass,
	isManagedComputePass,
	isManagedFeedbackPass
} from './pass-contract.js';
import type {
	AnyPass,
	RenderPass,
	RenderPassInputSlot,
	RenderPassOutputSlot,
	RenderTargetDefinitionMap
} from './types.js';

export type RenderTargetFormatMap = Readonly<Record<string, GPUTextureFormat>>;

/** Validates the renderer-owned working texture used by scene and presentation pipelines. */
export function validateWorkingFormat(format: unknown, deviceFeatures: ReadonlySet<string>): void {
	const diagnostic = {
		format,
		target: 'workingFormat',
		pass: 'Scene pipeline',
		deviceFeatures
	};
	assertFloatRenderableFormat(diagnostic);
	assertFloatSampledFormat(diagnostic);
}

/** Validates named color targets and returns their effective formats. */
export function validateRenderTargetFormats(
	definitions: RenderTargetDefinitionMap | undefined,
	defaultFormat: GPUTextureFormat,
	deviceFeatures: ReadonlySet<string>
): RenderTargetFormatMap {
	const formats: Record<string, GPUTextureFormat> = {};
	for (const key of Object.keys(definitions ?? {}).sort()) {
		const format = definitions?.[key]?.format ?? defaultFormat;
		assertRenderableFormat({
			format,
			target: key,
			pass: 'Named render target',
			deviceFeatures
		});
		formats[key] = format;
	}
	return formats;
}

function resolveInputFormat(
	slot: RenderPassInputSlot,
	workingFormat: GPUTextureFormat,
	namedFormats: RenderTargetFormatMap
): GPUTextureFormat | undefined {
	return slot === 'source' || slot === 'target' ? workingFormat : namedFormats[slot];
}

function resolveOutputFormat(
	slot: RenderPassOutputSlot,
	workingFormat: GPUTextureFormat,
	namedFormats: RenderTargetFormatMap
): GPUTextureFormat | undefined {
	if (slot === 'source' || slot === 'target') return workingFormat;
	if (slot === 'canvas') return workingFormat;
	return namedFormats[slot];
}

/** Validates only nominally branded Spektral render passes; structural custom passes stay open. */
export function validateBuiltInRenderPassFormats(input: {
	passes: readonly AnyPass[];
	workingFormat: GPUTextureFormat;
	namedFormats: RenderTargetFormatMap;
	deviceFeatures: ReadonlySet<string>;
}): void {
	for (const candidate of input.passes) {
		if (candidate.enabled === false || !isBuiltInRenderPass(candidate)) continue;
		const pass = candidate as RenderPass;
		const contract = candidate[builtInRenderPassBrand];
		const inputSlot = pass.input ?? 'source';
		const outputSlot = pass.output ?? ((pass.needsSwap ?? true) ? 'target' : 'source');
		const inputFormat = resolveInputFormat(inputSlot, input.workingFormat, input.namedFormats);
		const outputFormat = resolveOutputFormat(outputSlot, input.workingFormat, input.namedFormats);

		if (inputFormat !== undefined) {
			assertFloatSampledFormat({
				format: inputFormat,
				target: String(inputSlot),
				pass: contract.passName,
				deviceFeatures: input.deviceFeatures
			});
		}
		if (outputFormat !== undefined) {
			assertFloatRenderableFormat({
				format: outputFormat,
				target: String(outputSlot),
				pass: contract.passName,
				deviceFeatures: input.deviceFeatures
			});
		}
	}
}

/** Resolves the slot sampled by the implicit presentation pass for a static pass list. */
export function resolvePresentationSourceSlot(
	passes: readonly AnyPass[]
): RenderPassOutputSlot | null {
	let finalOutput: RenderPassOutputSlot | null = null;
	for (const candidate of passes) {
		if (
			candidate.enabled === false ||
			isManagedComputePass(candidate) ||
			isManagedFeedbackPass(candidate)
		) {
			continue;
		}
		const pass = candidate as RenderPass;
		finalOutput = (pass.needsSwap ?? true) ? 'source' : (pass.output ?? 'source');
	}
	return finalOutput;
}

/** Validates the implicit fullscreen presentation pass input before graph execution. */
export function validatePresentationSourceFormat(input: {
	slot: RenderPassOutputSlot;
	workingFormat: GPUTextureFormat;
	namedFormats: RenderTargetFormatMap;
	deviceFeatures: ReadonlySet<string>;
	requiresFilterableInput: boolean;
}): void {
	const format = resolveOutputFormat(input.slot, input.workingFormat, input.namedFormats);
	if (format === undefined) return;
	const capabilities = assertFloatSampledFormat({
		format,
		target: String(input.slot),
		pass: 'Presentation pass',
		deviceFeatures: input.deviceFeatures
	});
	if (input.requiresFilterableInput && !capabilities.filterable) {
		throw createFormatCapabilityError({
			target: String(input.slot),
			format,
			pass: 'Presentation pass',
			capability: 'filterable float texture sampling',
			detail: 'End the graph on workingFormat or enable the format-specific filtering feature.'
		});
	}
}
