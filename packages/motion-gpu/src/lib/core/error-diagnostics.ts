import type { MaterialSourceLocation } from './material-preprocess';

/**
 * Source metadata for material declaration callsite.
 */
export interface MaterialSourceMetadata {
	component?: string;
	file?: string;
	line?: number;
	column?: number;
	functionName?: string;
}

/**
 * One WGSL compiler diagnostic enriched with source-location metadata.
 */
export interface ShaderCompilationDiagnostic {
	generatedLine: number;
	message: string;
	linePos?: number;
	lineLength?: number;
	sourceLocation: MaterialSourceLocation | null;
}

/**
 * Structured payload attached to WGSL compilation errors.
 */
export interface ShaderCompilationDiagnosticsPayload {
	kind: 'shader-compilation';
	diagnostics: ShaderCompilationDiagnostic[];
	fragmentSource: string;
	includeSources: Record<string, string>;
	materialSource: MaterialSourceMetadata | null;
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

function isMaterialSourceLocation(value: unknown): value is MaterialSourceLocation | null {
	if (value === null) {
		return true;
	}

	if (typeof value !== 'object') {
		return false;
	}

	const record = value as Record<string, unknown>;
	const kind = record.kind;
	if (kind !== 'fragment' && kind !== 'include' && kind !== 'define') {
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
	if (!isMaterialSourceLocation(record.sourceLocation)) {
		return false;
	}

	return true;
}

/**
 * Attaches structured diagnostics payload to an Error.
 */
export function attachShaderCompilationDiagnostics(
	error: Error,
	payload: ShaderCompilationDiagnosticsPayload
): Error {
	(error as MotionGPUErrorWithDiagnostics).motiongpuDiagnostics = payload;
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
	if (!Array.isArray(record.diagnostics) || !record.diagnostics.every(isShaderCompilationDiagnostic)) {
		return null;
	}
	if (typeof record.fragmentSource !== 'string') {
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

	return {
		kind: 'shader-compilation',
		diagnostics: record.diagnostics as ShaderCompilationDiagnostic[],
		fragmentSource: record.fragmentSource,
		includeSources: includeSources as Record<string, string>,
		materialSource: (record.materialSource ?? null) as MaterialSourceMetadata | null
	};
}
