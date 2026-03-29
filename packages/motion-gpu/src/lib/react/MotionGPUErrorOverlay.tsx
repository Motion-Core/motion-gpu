import type { MotionGPUErrorReport } from '../core/error-report.js';
import { Portal } from './Portal.js';

interface MotionGPUErrorOverlayProps {
	report: MotionGPUErrorReport;
}

const MOTIONGPU_ERROR_OVERLAY_STYLES = `
.motiongpu-error-overlay {
	--motiongpu-base-hue: var(--base-hue, 265);
	--motiongpu-color-background: oklch(0.2178 0.0056 var(--motiongpu-base-hue));
	--motiongpu-color-background-muted: oklch(0.261 0.007 var(--motiongpu-base-hue));
	--motiongpu-color-foreground: oklch(1 0 0);
	--motiongpu-color-foreground-muted: oklch(0.6699 0.0081 var(--motiongpu-base-hue));
	--motiongpu-color-card: var(--motiongpu-color-background);
	--motiongpu-color-accent: oklch(0.6996 0.181959 44.4414);
	--motiongpu-color-accent-secondary: oklch(0.5096 0.131959 44.4414);
	--motiongpu-color-border: oklch(0.928 0.013 var(--motiongpu-base-hue) / 0.05);
	--motiongpu-color-white-fixed: oklch(1 0 0);
	--motiongpu-shadow-card: var(
		--shadow-2xl,
		0px 1px 1px -0.5px rgba(0, 0, 0, 0.06),
		0px 3px 3px -1.5px rgba(0, 0, 0, 0.06),
		0px 6px 6px -3px rgba(0, 0, 0, 0.06),
		0px 12px 12px -6px rgba(0, 0, 0, 0.06),
		0px 24px 24px -12px rgba(0, 0, 0, 0.05),
		0px 48px 48px -24px rgba(0, 0, 0, 0.06)
	);
	--motiongpu-radius-md: var(--radius-md, 0.5rem);
	--motiongpu-radius-lg: var(--radius-lg, 0.75rem);
	--motiongpu-radius-xl: var(--radius-xl, 1rem);
	--motiongpu-font-sans: var(
		--font-sans,
		'Inter',
		'Segoe UI',
		'Helvetica Neue',
		Arial,
		sans-serif
	);
	--motiongpu-font-mono: var(--font-mono, 'SFMono-Regular', 'Menlo', 'Consolas', monospace);
	position: fixed;
	inset: 0;
	display: grid;
	place-items: center;
	padding: clamp(0.75rem, 1.4vw, 1.5rem);
	background: rgba(0, 0, 0, 0.8);
	backdrop-filter: blur(10px);
	z-index: 2147483647;
	font-family: var(--motiongpu-font-sans);
	color-scheme: dark;
}

.motiongpu-error-dialog {
	width: min(52rem, calc(100vw - 1.5rem));
	max-height: min(84vh, 44rem);
	overflow: auto;
	margin: 0;
	padding: 1.1rem;
	border: 1px solid var(--motiongpu-color-border);
	border-radius: var(--motiongpu-radius-xl);
	max-width: calc(100vw - 1.5rem);
	box-sizing: border-box;
	font-size: 0.875rem;
	font-weight: 400;
	line-height: 1.45;
	background: var(--motiongpu-color-card);
	color: var(--motiongpu-color-foreground);
	box-shadow: var(--motiongpu-shadow-card);
}

.motiongpu-error-header {
	display: grid;
	gap: 0.55rem;
	padding-bottom: 0.9rem;
	border-bottom: 1px solid var(--motiongpu-color-border);
}

.motiongpu-error-header-top {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
}

.motiongpu-error-badges {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	flex-wrap: wrap;
}

.motiongpu-error-badge-wrap {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	width: fit-content;
	padding: 0.18rem;
	border-radius: 999px;
	border: 1px solid var(--motiongpu-color-border);
	background: var(--motiongpu-color-background-muted);
}

.motiongpu-error-badge {
	display: inline-flex;
	align-items: center;
	margin: 0;
	padding: 0.22rem 0.56rem;
	border-radius: 999px;
	font-size: 0.66rem;
	letter-spacing: 0.08em;
	line-height: 1;
	font-weight: 500;
	text-transform: uppercase;
	color: var(--motiongpu-color-white-fixed);
	background: linear-gradient(
		180deg,
		var(--motiongpu-color-accent) 0%,
		var(--motiongpu-color-accent-secondary) 100%
	);
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.motiongpu-error-badge-severity {
	background: linear-gradient(
		180deg,
		oklch(0.66 0.15 38) 0%,
		oklch(0.5 0.1 38) 100%
	);
}

.motiongpu-error-recoverable {
	margin: 0;
	font-size: 0.67rem;
	line-height: 1.2;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--motiongpu-color-foreground-muted);
}

.motiongpu-error-recoverable span {
	font-family: var(--motiongpu-font-mono);
	color: var(--motiongpu-color-foreground);
}

.motiongpu-error-title {
	margin: 0;
	font-size: clamp(1.02rem, 1vw + 0.72rem, 1.32rem);
	font-weight: 500;
	line-height: 1.18;
	letter-spacing: -0.02em;
	text-wrap: balance;
	color: var(--motiongpu-color-foreground);
}

.motiongpu-error-body {
	display: grid;
	gap: 0.62rem;
	margin-top: 0.92rem;
}

.motiongpu-error-message {
	margin: 0;
	padding: 0.72rem 0.78rem;
	border: 1px solid color-mix(in oklch, var(--motiongpu-color-accent) 28%, transparent);
	border-radius: var(--motiongpu-radius-md);
	background: color-mix(in oklch, var(--motiongpu-color-accent) 10%, transparent);
	font-size: 0.82rem;
	line-height: 1.4;
	font-weight: 400;
	color: var(--motiongpu-color-foreground);
}

.motiongpu-error-hint {
	margin: 0;
	font-size: 0.82rem;
	line-height: 1.45;
	font-weight: 400;
	color: var(--motiongpu-color-foreground-muted);
}

.motiongpu-error-sections {
	display: grid;
	gap: 0.62rem;
	margin-top: 0.95rem;
}

.motiongpu-error-source {
	display: grid;
	gap: 0.48rem;
	margin-top: 0.96rem;
}

.motiongpu-error-source-title {
	margin: 0;
	font-size: 0.8rem;
	font-weight: 500;
	line-height: 1.3;
	letter-spacing: 0.045em;
	text-transform: uppercase;
	color: var(--motiongpu-color-foreground);
}

.motiongpu-error-source-frame {
	border: 1px solid var(--motiongpu-color-border);
	border-radius: var(--motiongpu-radius-lg);
	overflow: hidden;
	background: var(--motiongpu-color-background-muted);
}

.motiongpu-error-source-tabs {
	display: flex;
	align-items: stretch;
	border-bottom: 1px solid var(--motiongpu-color-border);
	background: var(--motiongpu-color-background);
}

.motiongpu-error-source-tab {
	display: inline-flex;
	align-items: center;
	padding: 0.5rem 0.68rem;
	font-size: 0.76rem;
	font-weight: 400;
	line-height: 1.2;
	color: var(--motiongpu-color-foreground-muted);
	border-right: 1px solid var(--motiongpu-color-border);
}

.motiongpu-error-source-tab-active {
	color: var(--motiongpu-color-foreground);
	background: var(--motiongpu-color-background-muted);
}

.motiongpu-error-source-tab-spacer {
	flex: 1 1 auto;
}

.motiongpu-error-source-snippet {
	display: grid;
	background: var(--motiongpu-color-background-muted);
}

.motiongpu-error-source-row {
	display: grid;
	grid-template-columns: 2rem minmax(0, 1fr);
	align-items: start;
	gap: 0.42rem;
	padding: 0.2rem 0.68rem;
}

.motiongpu-error-source-row-active {
	background: color-mix(in oklch, var(--motiongpu-color-accent) 10%, transparent);
}

.motiongpu-error-source-line {
	font-family: var(--motiongpu-font-mono);
	font-size: 0.77rem;
	font-weight: 400;
	line-height: 1.3;
	font-variant-numeric: tabular-nums;
	font-feature-settings: 'tnum' 1;
	border-right: 1px solid var(--motiongpu-color-border);
	color: var(--motiongpu-color-foreground-muted);
	text-align: left;
}

.motiongpu-error-source-code {
	font-family: var(--motiongpu-font-mono);
	font-size: 0.77rem;
	font-weight: 400;
	line-height: 1.3;
	color: var(--motiongpu-color-foreground);
	white-space: pre-wrap;
	word-break: break-word;
}

.motiongpu-error-details {
	border: 1px solid var(--motiongpu-color-border);
	border-radius: var(--motiongpu-radius-lg);
	overflow: hidden;
	background: var(--motiongpu-color-background);
}

.motiongpu-error-details summary {
	cursor: pointer;
	padding: 0.56rem 0.68rem;
	font-size: 0.7rem;
	letter-spacing: 0.07em;
	line-height: 1.2;
	font-weight: 500;
	text-transform: uppercase;
	color: var(--motiongpu-color-foreground);
}

.motiongpu-error-details[open] summary {
	border-bottom: 1px solid var(--motiongpu-color-border);
}

.motiongpu-error-details pre {
	margin: 0;
	padding: 0.62rem 0.68rem;
	white-space: pre-wrap;
	word-break: break-word;
	overflow: auto;
	background: var(--motiongpu-color-background-muted);
	font-size: 0.74rem;
	line-height: 1.4;
	font-weight: 400;
	color: var(--motiongpu-color-foreground);
	font-family: var(--motiongpu-font-mono);
}

@media (max-width: 42rem) {
	.motiongpu-error-overlay {
		padding: 0.62rem;
	}

	.motiongpu-error-dialog {
		padding: 0.85rem;
	}

	.motiongpu-error-title {
		font-size: 1.02rem;
	}

	.motiongpu-error-header-top {
		flex-direction: column;
		align-items: flex-start;
	}
}

@media (prefers-reduced-motion: reduce) {
	.motiongpu-error-overlay {
		backdrop-filter: none;
	}
}
`;

function normalizeErrorText(value: string): string {
	return value
		.trim()
		.replace(/[.:!]+$/g, '')
		.toLowerCase();
}

function shouldShowErrorMessage(value: MotionGPUErrorReport): boolean {
	return resolveDisplayMessage(value).length > 0;
}

function resolveDisplayMessage(value: MotionGPUErrorReport): string {
	const rawMessage = value.message.trim();
	if (rawMessage.length === 0) {
		return '';
	}

	const normalizedMessage = normalizeErrorText(rawMessage);
	const normalizedTitle = normalizeErrorText(value.title);
	if (normalizedMessage === normalizedTitle) {
		return '';
	}

	const escapedTitle = value.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const prefixPattern = new RegExp(`^${escapedTitle}\\s*[:\\-|]\\s*`, 'i');
	const stripped = rawMessage.replace(prefixPattern, '').trim();
	return stripped.length > 0 ? stripped : rawMessage;
}

function formatRuntimeContext(context: MotionGPUErrorReport['context']): string {
	if (!context) {
		return '';
	}

	const indentBlock = (value: string, spaces = 2): string => {
		const prefix = ' '.repeat(spaces);
		return value
			.split('\n')
			.map((line) => `${prefix}${line}`)
			.join('\n');
	};

	const formatMaterialSignature = (value: string): string => {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return '<empty>';
		}
		try {
			return JSON.stringify(JSON.parse(trimmed), null, 2);
		} catch {
			return trimmed;
		}
	};

	const lines: string[] = [];
	if (context.materialSignature) {
		lines.push('materialSignature:');
		lines.push(indentBlock(formatMaterialSignature(context.materialSignature)));
	}
	if (context.passGraph) {
		lines.push('passGraph:');
		lines.push(`  passCount: ${context.passGraph.passCount}`);
		lines.push(`  enabledPassCount: ${context.passGraph.enabledPassCount}`);
		lines.push('  inputs:');
		if (context.passGraph.inputs.length === 0) {
			lines.push('    - <none>');
		} else {
			for (const input of context.passGraph.inputs) {
				lines.push(`    - ${input}`);
			}
		}
		lines.push('  outputs:');
		if (context.passGraph.outputs.length === 0) {
			lines.push('    - <none>');
		} else {
			for (const output of context.passGraph.outputs) {
				lines.push(`    - ${output}`);
			}
		}
	}
	lines.push('activeRenderTargets:');
	if (context.activeRenderTargets.length === 0) {
		lines.push('  - <none>');
	} else {
		for (const target of context.activeRenderTargets) {
			lines.push(`  - ${target}`);
		}
	}
	return lines.join('\n');
}

export function MotionGPUErrorOverlay({ report }: MotionGPUErrorOverlayProps) {
	const detailsSummary = report.source ? 'Additional diagnostics' : 'Technical details';

	return (
		<Portal>
			<style>{MOTIONGPU_ERROR_OVERLAY_STYLES}</style>
			<div className="motiongpu-error-overlay" role="presentation">
				<section
					className="motiongpu-error-dialog"
					role="alertdialog"
					aria-live="assertive"
					aria-modal="true"
					data-testid="motiongpu-error"
				>
					<header className="motiongpu-error-header">
						<div className="motiongpu-error-header-top">
							<div className="motiongpu-error-badges">
								<div className="motiongpu-error-badge-wrap">
									<p className="motiongpu-error-badge motiongpu-error-badge-phase">
										{report.phase}
									</p>
								</div>
								<div className="motiongpu-error-badge-wrap">
									<p className="motiongpu-error-badge motiongpu-error-badge-severity">
										{report.severity}
									</p>
								</div>
							</div>
						</div>
						<h2 className="motiongpu-error-title">{report.title}</h2>
						<p className="motiongpu-error-recoverable">
							Recoverable: <span>{report.recoverable ? 'yes' : 'no'}</span>
						</p>
					</header>
					<div className="motiongpu-error-body">
						{shouldShowErrorMessage(report) ? (
							<p className="motiongpu-error-message">{resolveDisplayMessage(report)}</p>
						) : null}
						<p className="motiongpu-error-hint">{report.hint}</p>
					</div>

					{report.source ? (
						<section className="motiongpu-error-source" aria-label="Source">
							<h3 className="motiongpu-error-source-title">Source</h3>
							<div className="motiongpu-error-source-frame" role="presentation">
								<div
									className="motiongpu-error-source-tabs"
									role="tablist"
									aria-label="Source files"
								>
									<span
										className="motiongpu-error-source-tab motiongpu-error-source-tab-active"
										role="tab"
										aria-selected="true"
									>
										{report.source.location}
										{report.source.column ? `, col ${report.source.column}` : ''}
									</span>
									<span className="motiongpu-error-source-tab-spacer" aria-hidden="true"></span>
								</div>

								<div className="motiongpu-error-source-snippet">
									{report.source.snippet.map((snippetLine) => (
										<div
											key={`snippet-${snippetLine.number}`}
											className={
												snippetLine.highlight
													? 'motiongpu-error-source-row motiongpu-error-source-row-active'
													: 'motiongpu-error-source-row'
											}
										>
											<span className="motiongpu-error-source-line">{snippetLine.number}</span>
											<span className="motiongpu-error-source-code">{snippetLine.code || ' '}</span>
										</div>
									))}
								</div>
							</div>
						</section>
					) : null}

					<div className="motiongpu-error-sections">
						{report.details.length > 0 ? (
							<details className="motiongpu-error-details" open>
								<summary>{detailsSummary}</summary>
								<pre>{report.details.join('\n')}</pre>
							</details>
						) : null}
						{report.stack.length > 0 ? (
							<details className="motiongpu-error-details">
								<summary>Stack trace</summary>
								<pre>{report.stack.join('\n')}</pre>
							</details>
						) : null}
						{report.context ? (
							<details className="motiongpu-error-details">
								<summary>Runtime context</summary>
								<pre>{formatRuntimeContext(report.context)}</pre>
							</details>
						) : null}
					</div>
				</section>
			</div>
		</Portal>
	);
}
