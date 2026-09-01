import {
	attachShaderCompilationDiagnostics,
	type ShaderCompilationDiagnostic,
	type ShaderCompilationRuntimeContext,
	type ShaderPipelineDiagnosticsMetadata
} from './error-diagnostics.js';
import { formatShaderSourceLocation, type ShaderLineMap } from './shader.js';

export interface ShaderPipelineDiagnosticSource {
	readonly lineMap: ShaderLineMap;
	readonly fragmentSource: string;
	readonly computeSource?: string;
	readonly includeSources?: Readonly<Record<string, string>>;
	readonly defineBlockSource?: string;
	readonly materialSource?: {
		readonly component?: string;
		readonly file?: string;
		readonly line?: number;
		readonly column?: number;
		readonly functionName?: string;
	} | null;
	readonly runtimeContext?: ShaderCompilationRuntimeContext;
	readonly pipeline?: ShaderPipelineDiagnosticsMetadata;
}

export interface RenderPipelineDiagnosticInput<TPipeline> extends ShaderPipelineDiagnosticSource {
	readonly compilationInfo: Promise<GPUCompilationInfo>;
	readonly pipelinePromise: Promise<TPipeline>;
	readonly validationScope: Promise<GPUError | null>;
	readonly errorPrefix?: string;
	readonly shaderStage?: 'fragment' | 'compute';
}

function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error ?? 'Unknown WebGPU error'));
}

function extractGeneratedLocation(message: string): { line: number; column?: number } | null {
	const lineMatch = message.match(/\bline\s+(\d+)(?::(\d+)|\s*,?\s*column\s+(\d+))?/i);
	const colonMatch = message.match(/:(\d+):(\d+)\b/);
	const lineValue = lineMatch?.[1] ?? colonMatch?.[1];
	if (!lineValue) return null;
	const line = Number.parseInt(lineValue, 10);
	if (!Number.isFinite(line) || line <= 0) return null;
	const columnValue = lineMatch?.[2] ?? lineMatch?.[3] ?? colonMatch?.[2];
	const column = columnValue ? Number.parseInt(columnValue, 10) : undefined;
	return {
		line,
		...(column !== undefined && Number.isFinite(column) && column > 0 ? { column } : {})
	};
}

function diagnosticFromError(error: unknown, lineMap: ShaderLineMap): ShaderCompilationDiagnostic {
	const normalized = normalizeError(error);
	const location = extractGeneratedLocation(normalized.message);
	return {
		generatedLine: location?.line ?? 0,
		message: normalized.message,
		...(location?.column !== undefined ? { linePos: location.column } : {}),
		sourceLocation:
			location?.line !== undefined
				? (lineMap[location.line] ?? { kind: 'wrapper', line: location.line })
				: null
	};
}

function diagnosticFromCompilationMessage(
	message: GPUCompilationMessage,
	lineMap: ShaderLineMap
): ShaderCompilationDiagnostic {
	return {
		generatedLine: message.lineNum,
		message: message.message,
		...(message.linePos > 0 ? { linePos: message.linePos } : {}),
		...(message.length > 0 ? { lineLength: message.length } : {}),
		sourceLocation:
			lineMap[message.lineNum] ??
			(message.lineNum > 0 ? { kind: 'wrapper', line: message.lineNum } : null)
	};
}

function formatDiagnostic(diagnostic: ShaderCompilationDiagnostic): string {
	const sourceLabel = formatShaderSourceLocation(diagnostic.sourceLocation);
	const generatedLineLabel =
		diagnostic.generatedLine > 0 ? `generated WGSL line ${diagnostic.generatedLine}` : null;
	const context = [sourceLabel, generatedLineLabel].filter(Boolean);
	return context.length === 0
		? diagnostic.message
		: `[${context.join(' | ')}] ${diagnostic.message}`;
}

/** Creates one structured, source-mapped shader/pipeline error without exposing generated WGSL. */
export function createShaderPipelineDiagnosticError(input: {
	readonly diagnostics: readonly ShaderCompilationDiagnostic[];
	readonly source: ShaderPipelineDiagnosticSource;
	readonly errorPrefix?: string;
	readonly shaderStage?: 'fragment' | 'compute';
	readonly cause?: unknown;
}): Error {
	const prefix = input.errorPrefix ?? 'WGSL compilation failed';
	const summary = input.diagnostics.map(formatDiagnostic).join('\n');
	const error = new Error(`${prefix}:${summary ? `\n${summary}` : ''}`, {
		...(input.cause !== undefined ? { cause: input.cause } : {})
	});
	return attachShaderCompilationDiagnostics(error, {
		kind: 'shader-compilation',
		...(input.shaderStage !== undefined ? { shaderStage: input.shaderStage } : {}),
		diagnostics: input.diagnostics,
		fragmentSource: input.source.fragmentSource,
		...(input.source.computeSource !== undefined
			? { computeSource: input.source.computeSource }
			: {}),
		includeSources: input.source.includeSources ?? {},
		...(input.source.defineBlockSource !== undefined
			? { defineBlockSource: input.source.defineBlockSource }
			: {}),
		materialSource: input.source.materialSource ?? null,
		...(input.source.runtimeContext !== undefined
			? { runtimeContext: input.source.runtimeContext }
			: {}),
		...(input.source.pipeline !== undefined ? { pipeline: input.source.pipeline } : {})
	});
}

/** Converts synchronous module/layout/pipeline failures to the shared structured shape. */
export function toShaderPipelineDiagnosticError(input: {
	readonly error: unknown;
	readonly source: ShaderPipelineDiagnosticSource;
	readonly errorPrefix?: string;
	readonly shaderStage?: 'fragment' | 'compute';
}): Error {
	return createShaderPipelineDiagnosticError({
		diagnostics: [diagnosticFromError(input.error, input.source.lineMap)],
		source: input.source,
		...(input.errorPrefix !== undefined ? { errorPrefix: input.errorPrefix } : {}),
		...(input.shaderStage !== undefined ? { shaderStage: input.shaderStage } : {}),
		cause: input.error
	});
}

/** Awaits compilation, async pipeline creation and validation scope as one deterministic gate. */
export async function awaitRenderPipelineDiagnostics<TPipeline>(
	input: RenderPipelineDiagnosticInput<TPipeline>
): Promise<TPipeline> {
	const [compilationResult, pipelineResult, validationResult] = await Promise.allSettled([
		input.compilationInfo,
		input.pipelinePromise,
		input.validationScope
	]);
	const compilationErrors =
		compilationResult.status === 'fulfilled'
			? compilationResult.value.messages.filter(
					(message: GPUCompilationMessage) => message.type === 'error'
				)
			: [];
	const diagnostics = compilationErrors.map((message) =>
		diagnosticFromCompilationMessage(message, input.lineMap)
	);
	if (
		diagnostics.length === 0 &&
		validationResult.status === 'fulfilled' &&
		validationResult.value
	) {
		diagnostics.push(diagnosticFromError(validationResult.value, input.lineMap));
	}
	if (diagnostics.length === 0 && pipelineResult.status === 'rejected') {
		diagnostics.push(diagnosticFromError(pipelineResult.reason, input.lineMap));
	}
	if (diagnostics.length > 0) {
		throw createShaderPipelineDiagnosticError({
			diagnostics,
			source: input,
			...(input.errorPrefix !== undefined ? { errorPrefix: input.errorPrefix } : {}),
			...(input.shaderStage !== undefined ? { shaderStage: input.shaderStage } : {}),
			...(pipelineResult.status === 'rejected' ? { cause: pipelineResult.reason } : {})
		});
	}
	if (pipelineResult.status === 'rejected') {
		throw toShaderPipelineDiagnosticError({
			error: pipelineResult.reason,
			source: input,
			...(input.errorPrefix !== undefined ? { errorPrefix: input.errorPrefix } : {}),
			...(input.shaderStage !== undefined ? { shaderStage: input.shaderStage } : {})
		});
	}
	return pipelineResult.value;
}
