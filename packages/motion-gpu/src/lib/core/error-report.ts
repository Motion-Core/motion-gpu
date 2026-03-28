import {
	getShaderCompilationDiagnostics,
	type ShaderCompilationDiagnostic
} from './error-diagnostics.js';
import { formatShaderSourceLocation } from './shader.js';

/**
 * Runtime phase in which an error occurred.
 */
export type MotionGPUErrorPhase = 'initialization' | 'render';

/**
 * Stable machine-readable error category code.
 */
export type MotionGPUErrorCode =
	| 'WEBGPU_UNAVAILABLE'
	| 'WEBGPU_ADAPTER_UNAVAILABLE'
	| 'WEBGPU_CONTEXT_UNAVAILABLE'
	| 'WGSL_COMPILATION_FAILED'
	| 'WEBGPU_DEVICE_LOST'
	| 'WEBGPU_UNCAPTURED_ERROR'
	| 'BIND_GROUP_MISMATCH'
	| 'TEXTURE_USAGE_INVALID'
	| 'TEXTURE_REQUEST_FAILED'
	| 'TEXTURE_DECODE_UNAVAILABLE'
	| 'TEXTURE_REQUEST_ABORTED'
	| 'COMPUTE_COMPILATION_FAILED'
	| 'MOTIONGPU_RUNTIME_ERROR';

/**
 * Severity level for user-facing diagnostics.
 */
export type MotionGPUErrorSeverity = 'error' | 'fatal';

/**
 * One source-code line displayed in diagnostics snippet.
 */
export interface MotionGPUErrorSourceLine {
	number: number;
	code: string;
	highlight: boolean;
}

/**
 * Structured source context displayed for shader compilation errors.
 */
export interface MotionGPUErrorSource {
	component: string;
	location: string;
	line: number;
	column?: number;
	snippet: MotionGPUErrorSourceLine[];
}

/**
 * Optional runtime context captured with diagnostics payload.
 */
export interface MotionGPUErrorContext {
	materialSignature?: string;
	passGraph?: {
		passCount: number;
		enabledPassCount: number;
		inputs: string[];
		outputs: string[];
	};
	activeRenderTargets: string[];
}

/**
 * Structured error payload used by UI diagnostics.
 */
export interface MotionGPUErrorReport {
	/**
	 * Stable machine-readable category code.
	 */
	code: MotionGPUErrorCode;
	/**
	 * Severity level used by diagnostics UIs and telemetry.
	 */
	severity: MotionGPUErrorSeverity;
	/**
	 * Whether runtime may recover without full renderer re-creation.
	 */
	recoverable: boolean;
	/**
	 * Short category title.
	 */
	title: string;
	/**
	 * Primary human-readable message.
	 */
	message: string;
	/**
	 * Suggested remediation hint.
	 */
	hint: string;
	/**
	 * Additional parsed details (for example WGSL line errors).
	 */
	details: string[];
	/**
	 * Stack trace lines when available.
	 */
	stack: string[];
	/**
	 * Original unmodified message.
	 */
	rawMessage: string;
	/**
	 * Runtime phase where the error occurred.
	 */
	phase: MotionGPUErrorPhase;
	/**
	 * Optional source context for shader-related diagnostics.
	 */
	source: MotionGPUErrorSource | null;
	/**
	 * Optional runtime context snapshot (material/pass graph/render targets).
	 */
	context: MotionGPUErrorContext | null;
}

/**
 * Splits multi-line values into trimmed non-empty lines.
 */
function splitLines(value: string): string[] {
	return value
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function toDisplayName(path: string): string {
	const normalized = path.split(/[?#]/)[0] ?? path;
	const chunks = normalized.split(/[\\/]/);
	const last = chunks[chunks.length - 1];
	return last && last.length > 0 ? last : path;
}

function toSnippet(source: string, line: number, radius = 3): MotionGPUErrorSourceLine[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	if (lines.length === 0) {
		return [];
	}

	const targetLine = Math.min(Math.max(1, line), lines.length);
	const start = Math.max(1, targetLine - radius);
	const end = Math.min(lines.length, targetLine + radius);
	const snippet: MotionGPUErrorSourceLine[] = [];

	for (let index = start; index <= end; index += 1) {
		snippet.push({
			number: index,
			code: lines[index - 1] ?? '',
			highlight: index === targetLine
		});
	}

	return snippet;
}

function buildSourceFromDiagnostics(error: unknown): MotionGPUErrorSource | null {
	const diagnostics = getShaderCompilationDiagnostics(error);
	if (!diagnostics || diagnostics.diagnostics.length === 0) {
		return null;
	}

	const primary = diagnostics.diagnostics.find((entry) => entry.sourceLocation !== null);
	if (!primary?.sourceLocation) {
		return null;
	}

	const location = primary.sourceLocation;
	const column = primary.linePos && primary.linePos > 0 ? primary.linePos : undefined;

	if (location.kind === 'fragment') {
		const component =
			diagnostics.materialSource?.component ??
			(diagnostics.materialSource?.file
				? toDisplayName(diagnostics.materialSource.file)
				: 'User shader fragment');
		const locationLabel = formatShaderSourceLocation(location) ?? `fragment line ${location.line}`;
		return {
			component,
			location: `${component} (${locationLabel})`,
			line: location.line,
			...(column !== undefined ? { column } : {}),
			snippet: toSnippet(diagnostics.fragmentSource, location.line)
		};
	}

	if (location.kind === 'include') {
		const includeName = location.include ?? 'unknown';
		const includeSource = diagnostics.includeSources[includeName] ?? '';
		const component = `#include <${includeName}>`;
		const locationLabel = formatShaderSourceLocation(location) ?? `include <${includeName}>`;
		return {
			component,
			location: `${component} (${locationLabel})`,
			line: location.line,
			...(column !== undefined ? { column } : {}),
			snippet: toSnippet(includeSource, location.line)
		};
	}

	const defineName = location.define ?? 'unknown';
	const defineLine = Math.max(1, location.line);
	const component = `#define ${defineName}`;
	const locationLabel =
		formatShaderSourceLocation(location) ?? `define "${defineName}" line ${defineLine}`;
	return {
		component,
		location: `${component} (${locationLabel})`,
		line: defineLine,
		...(column !== undefined ? { column } : {}),
		snippet: toSnippet(diagnostics.defineBlockSource ?? '', defineLine, 2)
	};
}

function formatDiagnosticMessage(entry: ShaderCompilationDiagnostic): string {
	const sourceLabel = formatShaderSourceLocation(entry.sourceLocation);
	const generatedLineLabel =
		entry.generatedLine > 0 ? `generated WGSL line ${entry.generatedLine}` : null;
	const labels = [sourceLabel, generatedLineLabel].filter((value) => Boolean(value));
	if (labels.length === 0) {
		return entry.message;
	}

	return `[${labels.join(' | ')}] ${entry.message}`;
}

/**
 * Maps known WebGPU/WGSL error patterns to a user-facing title and hint.
 */
function classifyErrorMessage(
	message: string
): Pick<MotionGPUErrorReport, 'code' | 'severity' | 'recoverable' | 'title' | 'hint'> {
	if (message.includes('WebGPU is not available in this browser')) {
		return {
			code: 'WEBGPU_UNAVAILABLE',
			severity: 'fatal',
			recoverable: false,
			title: 'WebGPU unavailable',
			hint: 'Use a browser with WebGPU enabled (latest Chrome/Edge/Safari TP) and secure context.'
		};
	}

	if (message.includes('Unable to acquire WebGPU adapter')) {
		return {
			code: 'WEBGPU_ADAPTER_UNAVAILABLE',
			severity: 'fatal',
			recoverable: false,
			title: 'WebGPU adapter unavailable',
			hint: 'GPU adapter request failed. Check browser permissions, flags and device support.'
		};
	}

	if (message.includes('Canvas does not support webgpu context')) {
		return {
			code: 'WEBGPU_CONTEXT_UNAVAILABLE',
			severity: 'error',
			recoverable: true,
			title: 'Canvas cannot create WebGPU context',
			hint: 'Make sure this canvas is attached to DOM and not using an unsupported context option.'
		};
	}

	if (message.includes('WGSL compilation failed')) {
		return {
			code: 'WGSL_COMPILATION_FAILED',
			severity: 'error',
			recoverable: true,
			title: 'WGSL compilation failed',
			hint: 'Check WGSL line numbers below and verify struct/binding/function signatures.'
		};
	}

	if (message.includes('Compute shader compilation failed')) {
		return {
			code: 'COMPUTE_COMPILATION_FAILED',
			severity: 'error',
			recoverable: true,
			title: 'Compute shader compilation failed',
			hint: 'Check WGSL compute shader sources below and verify storage bindings.'
		};
	}

	if (message.includes('WebGPU device lost') || message.includes('Device Lost')) {
		return {
			code: 'WEBGPU_DEVICE_LOST',
			severity: 'fatal',
			recoverable: false,
			title: 'WebGPU device lost',
			hint: 'GPU device/context was lost. Recreate the renderer and check OS/GPU stability.'
		};
	}

	if (message.includes('WebGPU uncaptured error')) {
		return {
			code: 'WEBGPU_UNCAPTURED_ERROR',
			severity: 'error',
			recoverable: true,
			title: 'WebGPU uncaptured error',
			hint: 'A GPU command failed asynchronously. Review details and validate resource/state usage.'
		};
	}

	if (message.includes('CreateBindGroup') || message.includes('bind group layout')) {
		return {
			code: 'BIND_GROUP_MISMATCH',
			severity: 'error',
			recoverable: true,
			title: 'Bind group mismatch',
			hint: 'Bindings in shader and runtime resources are out of sync. Verify uniforms/textures layout.'
		};
	}

	if (message.includes('Destination texture needs to have CopyDst')) {
		return {
			code: 'TEXTURE_USAGE_INVALID',
			severity: 'error',
			recoverable: true,
			title: 'Invalid texture usage flags',
			hint: 'Texture used as upload destination must include CopyDst (and often RenderAttachment).'
		};
	}

	if (message.includes('Texture request failed')) {
		return {
			code: 'TEXTURE_REQUEST_FAILED',
			severity: 'error',
			recoverable: true,
			title: 'Texture request failed',
			hint: 'Verify texture URL, CORS policy and response status before retrying.'
		};
	}

	if (message.includes('createImageBitmap is not available in this runtime')) {
		return {
			code: 'TEXTURE_DECODE_UNAVAILABLE',
			severity: 'fatal',
			recoverable: false,
			title: 'Texture decode unavailable',
			hint: 'Runtime lacks createImageBitmap support. Use a browser/runtime with image bitmap decoding.'
		};
	}

	if (message.toLowerCase().includes('texture request was aborted')) {
		return {
			code: 'TEXTURE_REQUEST_ABORTED',
			severity: 'error',
			recoverable: true,
			title: 'Texture request aborted',
			hint: 'Texture load was cancelled. Retry the request when source inputs stabilize.'
		};
	}

	return {
		code: 'MOTIONGPU_RUNTIME_ERROR',
		severity: 'error',
		recoverable: true,
		title: 'MotionGPU render error',
		hint: 'Review technical details below. If issue persists, isolate shader/uniform/texture changes.'
	};
}

/**
 * Converts unknown errors to a consistent, display-ready error report.
 *
 * @param error - Unknown thrown value.
 * @param phase - Phase during which error occurred.
 * @returns Normalized error report.
 */
export function toMotionGPUErrorReport(
	error: unknown,
	phase: MotionGPUErrorPhase
): MotionGPUErrorReport {
	const shaderDiagnostics = getShaderCompilationDiagnostics(error);
	const rawMessage =
		error instanceof Error
			? error.message
			: typeof error === 'string'
				? error
				: 'Unknown FragCanvas error';
	const rawLines = splitLines(rawMessage);
	const defaultMessage = rawLines[0] ?? rawMessage;
	const defaultDetails = rawLines.slice(1);
	const source = buildSourceFromDiagnostics(error);
	const context = shaderDiagnostics?.runtimeContext ?? null;
	const message =
		shaderDiagnostics && shaderDiagnostics.diagnostics[0]
			? formatDiagnosticMessage(shaderDiagnostics.diagnostics[0])
			: defaultMessage;
	const details = shaderDiagnostics
		? shaderDiagnostics.diagnostics.slice(1).map((entry) => formatDiagnosticMessage(entry))
		: defaultDetails;
	const stack =
		error instanceof Error && error.stack
			? splitLines(error.stack).filter((line) => line !== message)
			: [];
	const classification = classifyErrorMessage(rawMessage);

	return {
		code: classification.code,
		severity: classification.severity,
		recoverable: classification.recoverable,
		title: classification.title,
		message,
		hint: classification.hint,
		details,
		stack,
		rawMessage,
		phase,
		source,
		context
	};
}
