import { isPreparedFullscreenPass } from '../pass-contract.js';
import {
	isFullscreenPassPrepared,
	prepareFullscreenPass,
	releaseFullscreenPass,
	type PreparedFullscreenPassContract
} from '../pass-brand.js';
import type { AnyPass, RenderPass, RenderPassInputSlot, RenderPassOutputSlot } from '../types.js';
import type { RenderTargetFormatMap } from '../render-format-validation.js';

type PreparedRenderPass = RenderPass & PreparedFullscreenPassContract;

export interface ResolvedFullscreenPassPreparation {
	pass: PreparedRenderPass;
	inputFormat: GPUTextureFormat;
	outputFormat: GPUTextureFormat;
	key: string;
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
	if (slot === 'source' || slot === 'target' || slot === 'canvas') return workingFormat;
	return namedFormats[slot];
}

export function resolveFullscreenPassPreparation(input: {
	candidate: AnyPass;
	workingFormat: GPUTextureFormat;
	namedFormats: RenderTargetFormatMap;
}): ResolvedFullscreenPassPreparation | null {
	if (input.candidate.enabled === false || !isPreparedFullscreenPass(input.candidate)) return null;
	const inputSlot = input.candidate.input ?? 'source';
	const outputSlot =
		input.candidate.output ?? ((input.candidate.needsSwap ?? true) ? 'target' : 'source');
	const inputFormat = resolveInputFormat(inputSlot, input.workingFormat, input.namedFormats);
	const outputFormat = resolveOutputFormat(outputSlot, input.workingFormat, input.namedFormats);
	if (!inputFormat || !outputFormat) {
		throw new Error(
			`Cannot prepare fullscreen pass for unresolved ${!inputFormat ? `input "${inputSlot}"` : `output "${outputSlot}"`} format.`
		);
	}
	return {
		pass: input.candidate,
		inputFormat,
		outputFormat,
		key: `${inputFormat}|${outputFormat}|${String(inputSlot)}|${String(outputSlot)}`
	};
}

export function isFullscreenPassPreparationReady(
	preparation: ResolvedFullscreenPassPreparation,
	device: GPUDevice
): boolean {
	return preparation.pass[isFullscreenPassPrepared](
		device,
		preparation.inputFormat,
		preparation.outputFormat
	);
}

export function prepareResolvedFullscreenPass(input: {
	preparation: ResolvedFullscreenPassPreparation;
	device: GPUDevice;
	owner: object;
	replaceOwnerFormats?: boolean;
	retainOwnerOnFailure?: boolean;
	reportRecoverableError?: (error: Error) => void;
	requestRender?: () => void;
}): Promise<void> {
	return input.preparation.pass[prepareFullscreenPass]({
		device: input.device,
		owner: input.owner,
		inputFormat: input.preparation.inputFormat,
		outputFormat: input.preparation.outputFormat,
		...(input.reportRecoverableError !== undefined
			? { reportRecoverableError: input.reportRecoverableError }
			: {}),
		...(input.requestRender !== undefined ? { requestRender: input.requestRender } : {}),
		...(input.replaceOwnerFormats ? { replaceOwnerFormats: true } : {}),
		...(input.retainOwnerOnFailure ? { retainOwnerOnFailure: true } : {})
	});
}

/** Prepares every active nominal fullscreen pass without changing the public RenderPass contract. */
export async function prepareActiveFullscreenPasses(input: {
	passes: readonly AnyPass[];
	device: GPUDevice;
	owner: object;
	workingFormat: GPUTextureFormat;
	namedFormats: RenderTargetFormatMap;
	preparedPasses: Set<PreparedRenderPass>;
	reportRecoverableError?: (error: Error) => void;
	requestRender?: () => void;
}): Promise<void> {
	const preparations: Promise<void>[] = [];
	for (const candidate of input.passes) {
		const preparation = resolveFullscreenPassPreparation({
			candidate,
			workingFormat: input.workingFormat,
			namedFormats: input.namedFormats
		});
		if (!preparation) continue;
		input.preparedPasses.add(preparation.pass);
		preparations.push(
			prepareResolvedFullscreenPass({
				preparation,
				device: input.device,
				owner: input.owner,
				...(input.reportRecoverableError !== undefined
					? { reportRecoverableError: input.reportRecoverableError }
					: {}),
				...(input.requestRender !== undefined ? { requestRender: input.requestRender } : {})
			})
		);
	}
	await Promise.all(preparations);
}

/** Releases only the resources acquired by one renderer owner. */
export function releasePreparedFullscreenPass(
	pass: PreparedRenderPass,
	device: GPUDevice,
	owner: object
): void {
	pass[releaseFullscreenPass](device, owner);
}
