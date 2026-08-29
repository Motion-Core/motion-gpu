import type { MaterialSourceLocation, MaterialSourceMetadata } from './material-contracts.js';
export type { MaterialSourceMetadata } from './material-contracts.js';

export interface ComputeSourceLocation {
	readonly kind: 'compute';
	readonly line: number;
}

export type ShaderSourceLocation = MaterialSourceLocation | ComputeSourceLocation;

/**
 * One WGSL compiler diagnostic enriched with source-location metadata.
 */
export interface ShaderCompilationDiagnostic {
	readonly generatedLine: number;
	readonly message: string;
	readonly linePos?: number;
	readonly lineLength?: number;
	readonly sourceLocation: ShaderSourceLocation | null;
}

/**
 * Runtime context snapshot captured for shader compilation diagnostics.
 */
export interface ShaderCompilationRuntimeContext {
	readonly materialSignature?: string;
	readonly passGraph?: {
		readonly passCount: number;
		readonly enabledPassCount: number;
		readonly inputs: readonly string[];
		readonly outputs: readonly string[];
	};
	readonly activeRenderTargets: readonly string[];
}

/**
 * Structured payload attached to WGSL compilation errors.
 */
export interface ShaderCompilationDiagnosticsPayload {
	readonly kind: 'shader-compilation';
	readonly shaderStage?: 'fragment' | 'compute';
	readonly diagnostics: readonly ShaderCompilationDiagnostic[];
	readonly fragmentSource: string;
	readonly computeSource?: string;
	readonly includeSources: Readonly<Record<string, string>>;
	readonly defineBlockSource?: string;
	readonly materialSource: MaterialSourceMetadata | null;
	readonly runtimeContext?: ShaderCompilationRuntimeContext;
}

type MotionGPUErrorWithDiagnostics = Error & {
	motiongpuDiagnostics?: unknown;
};

function isMaterialSourceMetadata(value: unknown): value is MaterialSourceMetadata {
	if (value === null || typeof value !== 'object') {
		return false;
	}

	const record = value as Record<string, unknown>;
	if (record.component !== undefined && typeof record.component !== 'string') {
		return false;
	}
	if (record.file !== undefined && typeof record.file !== 'string') {
		return false;
	}
	if (record.functionName !== undefined && typeof record.functionName !== 'string') {
		return false;
	}
	if (record.line !== undefined && typeof record.line !== 'number') {
		return false;
	}
	if (record.column !== undefined && typeof record.column !== 'number') {
		return false;
	}

	return true;
}

function isShaderSourceLocation(value: unknown): value is ShaderSourceLocation | null {
	if (value === null) {
		return true;
	}

	if (typeof value !== 'object') {
		return false;
	}

	const record = value as Record<string, unknown>;
	const kind = record.kind;
	if (kind !== 'fragment' && kind !== 'include' && kind !== 'define' && kind !== 'compute') {
		return false;
	}

	return typeof record.line === 'number';
}

function isShaderCompilationDiagnostic(value: unknown): value is ShaderCompilationDiagnostic {
	if (value === null || typeof value !== 'object') {
		return false;
	}

	const record = value as Record<string, unknown>;
	if (typeof record.generatedLine !== 'number') {
		return false;
	}
	if (typeof record.message !== 'string') {
		return false;
	}
	if (record.linePos !== undefined && typeof record.linePos !== 'number') {
		return false;
	}
	if (record.lineLength !== undefined && typeof record.lineLength !== 'number') {
		return false;
	}
	if (!isShaderSourceLocation(record.sourceLocation)) {
		return false;
	}

	return true;
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isShaderCompilationRuntimeContext(
	value: unknown
): value is ShaderCompilationRuntimeContext {
	if (value === null || typeof value !== 'object') {
		return false;
	}

	const record = value as Record<string, unknown>;
	if (record.materialSignature !== undefined && typeof record.materialSignature !== 'string') {
		return false;
	}
	if (!isStringArray(record.activeRenderTargets)) {
		return false;
	}
	const passGraph = record.passGraph;
	if (passGraph === undefined) {
		return true;
	}
	if (passGraph === null || typeof passGraph !== 'object') {
		return false;
	}

	const passGraphRecord = passGraph as Record<string, unknown>;
	if (typeof passGraphRecord.passCount !== 'number') {
		return false;
	}
	if (typeof passGraphRecord.enabledPassCount !== 'number') {
		return false;
	}
	if (!isStringArray(passGraphRecord.inputs) || !isStringArray(passGraphRecord.outputs)) {
		return false;
	}

	return true;
}

function freezeShaderSourceLocation(
	location: ShaderSourceLocation | null
): ShaderSourceLocation | null {
	if (location === null) {
		return null;
	}

	return Object.freeze({
		kind: location.kind,
		line: location.line,
		...('include' in location && location.include !== undefined
			? { include: location.include }
			: {}),
		...('define' in location && location.define !== undefined ? { define: location.define } : {})
	}) as ShaderSourceLocation;
}

function freezeMaterialSource(
	source: MaterialSourceMetadata | null
): MaterialSourceMetadata | null {
	if (source === null) {
		return null;
	}

	return Object.freeze({
		...(source.component !== undefined ? { component: source.component } : {}),
		...(source.file !== undefined ? { file: source.file } : {}),
		...(source.line !== undefined ? { line: source.line } : {}),
		...(source.column !== undefined ? { column: source.column } : {}),
		...(source.functionName !== undefined ? { functionName: source.functionName } : {})
	});
}

function freezeRuntimeContext(
	context: ShaderCompilationRuntimeContext
): ShaderCompilationRuntimeContext {
	return Object.freeze({
		...(context.materialSignature !== undefined
			? { materialSignature: context.materialSignature }
			: {}),
		...(context.passGraph !== undefined
			? {
					passGraph: Object.freeze({
						passCount: context.passGraph.passCount,
						enabledPassCount: context.passGraph.enabledPassCount,
						inputs: Object.freeze([...context.passGraph.inputs]),
						outputs: Object.freeze([...context.passGraph.outputs])
					})
				}
			: {}),
		activeRenderTargets: Object.freeze([...context.activeRenderTargets])
	});
}

function freezeDiagnosticsPayload(
	payload: ShaderCompilationDiagnosticsPayload
): ShaderCompilationDiagnosticsPayload {
	return Object.freeze({
		kind: 'shader-compilation',
		...(payload.shaderStage !== undefined ? { shaderStage: payload.shaderStage } : {}),
		diagnostics: Object.freeze(
			payload.diagnostics.map((diagnostic) =>
				Object.freeze({
					generatedLine: diagnostic.generatedLine,
					message: diagnostic.message,
					...(diagnostic.linePos !== undefined ? { linePos: diagnostic.linePos } : {}),
					...(diagnostic.lineLength !== undefined ? { lineLength: diagnostic.lineLength } : {}),
					sourceLocation: freezeShaderSourceLocation(diagnostic.sourceLocation)
				})
			)
		),
		fragmentSource: payload.fragmentSource,
		...(payload.computeSource !== undefined ? { computeSource: payload.computeSource } : {}),
		includeSources: Object.freeze(Object.fromEntries(Object.entries(payload.includeSources))),
		...(payload.defineBlockSource !== undefined
			? { defineBlockSource: payload.defineBlockSource }
			: {}),
		materialSource: freezeMaterialSource(payload.materialSource),
		...(payload.runtimeContext !== undefined
			? { runtimeContext: freezeRuntimeContext(payload.runtimeContext) }
			: {})
	});
}

/**
 * Attaches structured diagnostics payload to an Error.
 */
export function attachShaderCompilationDiagnostics(
	error: Error,
	payload: ShaderCompilationDiagnosticsPayload
): Error {
	(error as MotionGPUErrorWithDiagnostics).motiongpuDiagnostics = freezeDiagnosticsPayload(payload);
	return error;
}

/**
 * Extracts structured diagnostics payload from unknown error value.
 */
export function getShaderCompilationDiagnostics(
	error: unknown
): ShaderCompilationDiagnosticsPayload | null {
	if (!(error instanceof Error)) {
		return null;
	}

	const payload = (error as MotionGPUErrorWithDiagnostics).motiongpuDiagnostics;
	if (payload === null || typeof payload !== 'object') {
		return null;
	}

	const record = payload as Record<string, unknown>;
	if (record.kind !== 'shader-compilation') {
		return null;
	}
	if (
		record.shaderStage !== undefined &&
		record.shaderStage !== 'fragment' &&
		record.shaderStage !== 'compute'
	) {
		return null;
	}
	if (
		!Array.isArray(record.diagnostics) ||
		!record.diagnostics.every(isShaderCompilationDiagnostic)
	) {
		return null;
	}
	if (typeof record.fragmentSource !== 'string') {
		return null;
	}
	if (record.computeSource !== undefined && typeof record.computeSource !== 'string') {
		return null;
	}
	if (record.defineBlockSource !== undefined && typeof record.defineBlockSource !== 'string') {
		return null;
	}
	if (record.includeSources === null || typeof record.includeSources !== 'object') {
		return null;
	}
	const includeSources = record.includeSources as Record<string, unknown>;
	if (Object.values(includeSources).some((value) => typeof value !== 'string')) {
		return null;
	}
	if (record.materialSource !== null && !isMaterialSourceMetadata(record.materialSource)) {
		return null;
	}
	if (
		record.runtimeContext !== undefined &&
		!isShaderCompilationRuntimeContext(record.runtimeContext)
	) {
		return null;
	}

	return freezeDiagnosticsPayload({
		kind: 'shader-compilation',
		...(record.shaderStage !== undefined
			? { shaderStage: record.shaderStage as 'fragment' | 'compute' }
			: {}),
		diagnostics: record.diagnostics as readonly ShaderCompilationDiagnostic[],
		fragmentSource: record.fragmentSource,
		...(record.computeSource !== undefined
			? { computeSource: record.computeSource as string }
			: {}),
		includeSources: includeSources as Readonly<Record<string, string>>,
		...(record.defineBlockSource !== undefined
			? { defineBlockSource: record.defineBlockSource as string }
			: {}),
		materialSource: (record.materialSource ?? null) as MaterialSourceMetadata | null,
		...(record.runtimeContext !== undefined
			? { runtimeContext: record.runtimeContext as ShaderCompilationRuntimeContext }
			: {})
	});
}
