import {
	type ShaderCompilationDiagnostic,
	type ShaderCompilationRuntimeContext
} from '../error-diagnostics.js';
import { createShaderPipelineDiagnosticError } from '../pipeline-diagnostics.js';
import { isManagedComputePass, isManagedFeedbackPass } from '../pass-contract.js';
import type { ShaderLineMap } from '../shader.js';
import type { AnyPass, RenderPass, RendererOptions } from '../types.js';

/** Throws when a shader module contains WGSL compilation errors. */
export async function assertCompilation(
	module: GPUShaderModule,
	options?: {
		lineMap?: ShaderLineMap;
		fragmentSource?: string;
		computeSource?: string;
		includeSources?: Record<string, string>;
		defineBlockSource?: string;
		materialSource?: {
			component?: string;
			file?: string;
			line?: number;
			column?: number;
			functionName?: string;
		} | null;
		runtimeContext?: ShaderCompilationRuntimeContext;
		errorPrefix?: string;
		shaderStage?: 'fragment' | 'compute';
	}
): Promise<void> {
	const info = await module.getCompilationInfo();
	const errors = info.messages.filter((message: GPUCompilationMessage) => message.type === 'error');

	if (errors.length === 0) return;

	const diagnostics = errors.map((message: GPUCompilationMessage) => ({
		generatedLine: message.lineNum,
		message: message.message,
		linePos: message.linePos,
		lineLength: message.length,
		sourceLocation: options?.lineMap?.[message.lineNum] ?? null
	}));
	const prefix = options?.errorPrefix ?? 'WGSL compilation failed';
	throw createShaderPipelineDiagnosticError({
		diagnostics,
		source: {
			lineMap: options?.lineMap ?? [],
			fragmentSource: options?.fragmentSource ?? '',
			includeSources: options?.includeSources ?? {},
			...(options?.defineBlockSource !== undefined
				? { defineBlockSource: options.defineBlockSource }
				: {}),
			materialSource: options?.materialSource ?? null,
			...(options?.runtimeContext !== undefined ? { runtimeContext: options.runtimeContext } : {})
		},
		errorPrefix: prefix,
		...(options?.shaderStage !== undefined ? { shaderStage: options.shaderStage } : {})
	});
}

function extractGeneratedLineFromComputeError(message: string): number | null {
	const lineMatch = message.match(/\bline\s+(\d+)\b/i);
	if (lineMatch) {
		const parsed = Number.parseInt(lineMatch[1] ?? '', 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	const colonMatch = message.match(/:(\d+):\d+/);
	if (colonMatch) {
		const parsed = Number.parseInt(colonMatch[1] ?? '', 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return null;
}

function buildComputeCompilationError(input: {
	diagnostics: ShaderCompilationDiagnostic[];
	computeSource: string;
	runtimeContext: ShaderCompilationRuntimeContext;
}): Error {
	return createShaderPipelineDiagnosticError({
		diagnostics: input.diagnostics,
		source: {
			lineMap: [],
			fragmentSource: '',
			computeSource: input.computeSource,
			includeSources: {},
			materialSource: null,
			runtimeContext: input.runtimeContext
		},
		errorPrefix: 'Compute shader compilation failed',
		shaderStage: 'compute'
	});
}

export function toComputeCompilationError(input: {
	error: unknown;
	lineMap: ShaderLineMap;
	computeSource: string;
	runtimeContext: ShaderCompilationRuntimeContext;
}): Error {
	const baseError =
		input.error instanceof Error ? input.error : new Error(String(input.error ?? 'Unknown error'));
	const generatedLine = extractGeneratedLineFromComputeError(baseError.message) ?? 0;
	return buildComputeCompilationError({
		diagnostics: [
			{
				generatedLine,
				message: baseError.message,
				sourceLocation: generatedLine > 0 ? (input.lineMap[generatedLine] ?? null) : null
			}
		],
		computeSource: input.computeSource,
		runtimeContext: input.runtimeContext
	});
}

export async function assertComputeCompilationAsync(input: {
	module: GPUShaderModule;
	validationScope: Promise<GPUError | null>;
	lineMap: ShaderLineMap;
	computeSource: string;
	runtimeContext: ShaderCompilationRuntimeContext;
}): Promise<Error | null> {
	let compilationMessages: GPUCompilationMessage[] = [];
	try {
		const info = await input.module.getCompilationInfo();
		compilationMessages = info.messages.filter(
			(message: GPUCompilationMessage) => message.type === 'error'
		);
	} catch {
		// Some runtimes cannot report compilation info; validation scope remains authoritative.
	}
	const validationError = await input.validationScope.catch(() => null);
	if (compilationMessages.length === 0 && !validationError) return null;
	const diagnostics =
		compilationMessages.length > 0
			? compilationMessages.map((message: GPUCompilationMessage) => ({
					generatedLine: message.lineNum,
					message: message.message,
					linePos: message.linePos,
					lineLength: message.length,
					sourceLocation: input.lineMap[message.lineNum] ?? null
				}))
			: [{ generatedLine: 0, message: validationError!.message, sourceLocation: null }];
	return buildComputeCompilationError({
		diagnostics,
		computeSource: input.computeSource,
		runtimeContext: input.runtimeContext
	});
}

function buildPassGraphSnapshot(
	passes: AnyPass[] | undefined
): NonNullable<ShaderCompilationRuntimeContext['passGraph']> {
	const declaredPasses = passes ?? [];
	let enabledPassCount = 0;
	const inputs: string[] = [];
	const outputs: string[] = [];
	for (const pass of declaredPasses) {
		if (pass.enabled === false) continue;
		enabledPassCount += 1;
		if (isManagedComputePass(pass) || isManagedFeedbackPass(pass)) continue;
		const rp = pass as RenderPass;
		const needsSwap = rp.needsSwap ?? true;
		inputs.push(rp.input ?? 'source');
		outputs.push(rp.output ?? (needsSwap ? 'target' : 'source'));
	}
	return {
		passCount: declaredPasses.length,
		enabledPassCount,
		inputs: Array.from(new Set(inputs)).sort((a, b) => a.localeCompare(b)),
		outputs: Array.from(new Set(outputs)).sort((a, b) => a.localeCompare(b))
	};
}

export function buildShaderCompilationRuntimeContext(
	options: RendererOptions,
	initialSnapshot?: {
		passes: AnyPass[] | undefined;
		renderTargets: RendererOptions['renderTargets'];
	}
): ShaderCompilationRuntimeContext {
	const passList = initialSnapshot
		? initialSnapshot.passes
		: (options.getPasses?.() ?? options.passes);
	const renderTargetMap = initialSnapshot
		? initialSnapshot.renderTargets
		: (options.getRenderTargets?.() ?? options.renderTargets);
	return {
		...(options.materialSignature ? { materialSignature: options.materialSignature } : {}),
		passGraph: buildPassGraphSnapshot(passList),
		activeRenderTargets: Object.keys(renderTargetMap ?? {}).sort((a, b) => a.localeCompare(b))
	};
}
