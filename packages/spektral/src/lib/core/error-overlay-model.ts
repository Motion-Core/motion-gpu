import type { SpektralErrorContext, SpektralErrorReport } from './error-report.js';

export interface SpektralErrorOverlayModel {
	readonly displayMessage: string;
	readonly runtimeContextText: string;
}

function normalizeErrorText(value: string): string {
	return value
		.trim()
		.replace(/[.:!]+$/g, '')
		.toLowerCase();
}

function resolveDisplayMessage(report: SpektralErrorReport): string {
	const rawMessage = report.message.trim();
	if (
		rawMessage.length === 0 ||
		normalizeErrorText(rawMessage) === normalizeErrorText(report.title)
	) {
		return '';
	}

	const escapedTitle = report.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const stripped = rawMessage
		.replace(new RegExp(`^${escapedTitle}\\s*[:\\-|]\\s*`, 'i'), '')
		.trim();
	return stripped.length > 0 ? stripped : rawMessage;
}

function indentBlock(value: string, spaces = 2): string {
	const prefix = ' '.repeat(spaces);
	return value
		.split('\n')
		.map((line) => `${prefix}${line}`)
		.join('\n');
}

function formatMaterialSignature(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) return '<empty>';

	try {
		return JSON.stringify(JSON.parse(trimmed), null, 2);
	} catch {
		return trimmed;
	}
}

function appendList(lines: string[], values: readonly string[], indent = 2): void {
	const prefix = ' '.repeat(indent);
	if (values.length === 0) {
		lines.push(`${prefix}- <none>`);
		return;
	}
	for (const value of values) lines.push(`${prefix}- ${value}`);
}

function formatRuntimeContext(context: SpektralErrorContext | null): string {
	if (!context) return '';

	const lines: string[] = [];
	if (context.materialSignature) {
		lines.push(
			'materialSignature:',
			indentBlock(formatMaterialSignature(context.materialSignature))
		);
	}
	if (context.passGraph) {
		lines.push(
			'passGraph:',
			`  passCount: ${context.passGraph.passCount}`,
			`  enabledPassCount: ${context.passGraph.enabledPassCount}`,
			'  inputs:'
		);
		appendList(lines, context.passGraph.inputs, 4);
		lines.push('  outputs:');
		appendList(lines, context.passGraph.outputs, 4);
	}
	lines.push('activeRenderTargets:');
	appendList(lines, context.activeRenderTargets);
	return lines.join('\n');
}

/** Creates the framework-neutral text model rendered by all error overlays. */
export function createSpektralErrorOverlayModel(
	report: SpektralErrorReport
): SpektralErrorOverlayModel {
	return {
		displayMessage: resolveDisplayMessage(report),
		runtimeContextText: formatRuntimeContext(report.context)
	};
}
