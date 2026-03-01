import { getShaderCompilationDiagnostics } from './error-diagnostics';

/**
 * Runtime phase in which an error occurred.
 */
export type MotionGPUErrorPhase = 'initialization' | 'render';

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
 * Structured error payload used by UI diagnostics.
 */
export interface MotionGPUErrorReport {
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

	const primary = diagnostics.diagnostics.find((entry) => {
		const location = entry.sourceLocation;
		return location?.kind === 'fragment' || location?.kind === 'include';
	});
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
		return {
			component,
			location: `${component} (fragment line ${location.line})`,
			line: location.line,
			...(column !== undefined ? { column } : {}),
			snippet: toSnippet(diagnostics.fragmentSource, location.line)
		};
	}

	const includeName = location.include ?? 'unknown';
	const includeSource = diagnostics.includeSources[includeName] ?? '';
	const component = `#include <${includeName}>`;
	return {
		component,
		location: `${component} (line ${location.line})`,
		line: location.line,
		...(column !== undefined ? { column } : {}),
		snippet: toSnippet(includeSource, location.line)
	};
}

/**
 * Maps known WebGPU/WGSL error patterns to a user-facing title and hint.
 */
function classifyErrorMessage(message: string): Pick<MotionGPUErrorReport, 'title' | 'hint'> {
	if (message.includes('WebGPU is not available in this browser')) {
		return {
			title: 'WebGPU unavailable',
			hint: 'Use a browser with WebGPU enabled (latest Chrome/Edge/Safari TP) and secure context.'
		};
	}

	if (message.includes('Unable to acquire WebGPU adapter')) {
		return {
			title: 'WebGPU adapter unavailable',
			hint: 'GPU adapter request failed. Check browser permissions, flags and device support.'
		};
	}

	if (message.includes('Canvas does not support webgpu context')) {
		return {
			title: 'Canvas cannot create WebGPU context',
			hint: 'Make sure this canvas is attached to DOM and not using an unsupported context option.'
		};
	}

	if (message.includes('WGSL compilation failed')) {
		return {
			title: 'WGSL compilation failed',
			hint: 'Check WGSL line numbers below and verify struct/binding/function signatures.'
		};
	}

	if (message.includes('WebGPU device lost') || message.includes('Device Lost')) {
		return {
			title: 'WebGPU device lost',
			hint: 'GPU device/context was lost. Recreate the renderer and check OS/GPU stability.'
		};
	}

	if (message.includes('WebGPU uncaptured error')) {
		return {
			title: 'WebGPU uncaptured error',
			hint: 'A GPU command failed asynchronously. Review details and validate resource/state usage.'
		};
	}

	if (message.includes('CreateBindGroup') || message.includes('bind group layout')) {
		return {
			title: 'Bind group mismatch',
			hint: 'Bindings in shader and runtime resources are out of sync. Verify uniforms/textures layout.'
		};
	}

	if (message.includes('Destination texture needs to have CopyDst')) {
		return {
			title: 'Invalid texture usage flags',
			hint: 'Texture used as upload destination must include CopyDst (and often RenderAttachment).'
		};
	}

	return {
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
	const message =
		shaderDiagnostics && shaderDiagnostics.diagnostics[0]
			? shaderDiagnostics.diagnostics[0].message
			: defaultMessage;
	const details = shaderDiagnostics
		? shaderDiagnostics.diagnostics.slice(1).map((entry) => entry.message)
		: defaultDetails;
	const stack =
		error instanceof Error && error.stack
			? splitLines(error.stack).filter((line) => line !== message)
			: [];
	const classification = classifyErrorMessage(rawMessage);

	return {
		title: classification.title,
		message,
		hint: classification.hint,
		details,
		stack,
		rawMessage,
		phase,
		source
	};
}
