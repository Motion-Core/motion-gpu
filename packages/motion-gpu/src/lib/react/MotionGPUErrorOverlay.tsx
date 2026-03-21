import type { MotionGPUErrorReport } from '../core/error-report.js';
import { Portal } from './Portal.js';

interface MotionGPUErrorOverlayProps {
	report: MotionGPUErrorReport;
}

function normalizeErrorText(value: string): string {
	return value
		.trim()
		.replace(/[.:!]+$/g, '')
		.toLowerCase();
}

function shouldShowErrorMessage(value: MotionGPUErrorReport): boolean {
	return normalizeErrorText(value.message) !== normalizeErrorText(value.title);
}

export function MotionGPUErrorOverlay({ report }: MotionGPUErrorOverlayProps) {
	const detailsSummary = report.source ? 'Additional diagnostics' : 'Technical details';

	return (
		<Portal>
			<div
				className="motiongpu-error-overlay"
				role="presentation"
				style={{
					position: 'fixed',
					inset: 0,
					display: 'grid',
					placeItems: 'center',
					padding: '1rem',
					background: 'rgba(12, 12, 14, 0.38)',
					backdropFilter: 'blur(10px)',
					zIndex: 2147483647
				}}
			>
				<section
					role="alertdialog"
					aria-live="assertive"
					aria-modal="true"
					data-testid="motiongpu-error"
					style={{
						width: 'min(52rem, calc(100vw - 1.5rem))',
						maxHeight: 'min(84vh, 44rem)',
						overflow: 'auto',
						margin: 0,
						padding: '1rem',
						border: '1px solid rgba(107, 107, 107, 0.2)',
						borderRadius: '1rem',
						boxSizing: 'border-box',
						background: '#ffffff',
						color: '#262626',
						fontSize: '0.875rem',
						lineHeight: 1.45
					}}
				>
					<header style={{ display: 'grid', gap: '0.5rem' }}>
						<p
							style={{
								margin: 0,
								fontSize: '0.66rem',
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
								color: '#5f6672'
							}}
						>
							{report.phase}
						</p>
						<h2 style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.2 }}>{report.title}</h2>
					</header>
					<div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
						{shouldShowErrorMessage(report) ? <p style={{ margin: 0 }}>{report.message}</p> : null}
						<p style={{ margin: 0, color: '#5f6672' }}>{report.hint}</p>
					</div>

					{report.source ? (
						<section aria-label="Source" style={{ marginTop: '0.75rem' }}>
							<h3 style={{ margin: 0, fontSize: '0.8rem', textTransform: 'uppercase' }}>Source</h3>
							<div style={{ marginTop: '0.4rem', border: '1px solid rgba(107, 107, 107, 0.2)' }}>
								<div
									style={{
										padding: '0.45rem 0.6rem',
										borderBottom: '1px solid rgba(107, 107, 107, 0.2)'
									}}
								>
									<span>
										{report.source.location}
										{report.source.column ? `, col ${report.source.column}` : ''}
									</span>
								</div>
								<div style={{ display: 'grid' }}>
									{report.source.snippet.map((snippetLine) => (
										<div
											key={`snippet-${snippetLine.number}`}
											style={{
												display: 'grid',
												gridTemplateColumns: '2rem minmax(0, 1fr)',
												gap: '0.42rem',
												padding: '0.2rem 0.5rem',
												background: snippetLine.highlight ? 'rgba(255, 105, 0, 0.08)' : undefined
											}}
										>
											<span>{snippetLine.number}</span>
											<span className="motiongpu-error-source-code">{snippetLine.code || ' '}</span>
										</div>
									))}
								</div>
							</div>
						</section>
					) : null}

					{report.details.length > 0 ? (
						<details open style={{ marginTop: '0.75rem' }}>
							<summary>{detailsSummary}</summary>
							<pre style={{ whiteSpace: 'pre-wrap' }}>{report.details.join('\n')}</pre>
						</details>
					) : null}
					{report.stack.length > 0 ? (
						<details style={{ marginTop: '0.75rem' }}>
							<summary>Stack trace</summary>
							<pre style={{ whiteSpace: 'pre-wrap' }}>{report.stack.join('\n')}</pre>
						</details>
					) : null}
				</section>
			</div>
		</Portal>
	);
}
