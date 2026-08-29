import {
	useEffect,
	useId,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import '../motion-gpu.css';
import { createMotionGPUErrorOverlayModel } from '../core/error-overlay-model.js';
import { registerErrorOverlay } from '../core/error-overlay-stack.js';
import type { MotionGPUErrorReport } from '../core/error-report.js';
import { Portal } from './Portal.js';

interface MotionGPUErrorOverlayProps {
	report: MotionGPUErrorReport;
	onDismiss: () => void;
}

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ChevronDownIcon() {
	return (
		<svg
			className="motiongpu-error-details-chevron"
			viewBox="0 0 18 18"
			fill="none"
			aria-hidden="true"
			focusable="false"
		>
			<polyline
				points="15.25 6.5 9 12.75 2.75 6.5"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function MotionGPUErrorOverlay({ report, onDismiss }: MotionGPUErrorOverlayProps) {
	const model = createMotionGPUErrorOverlayModel(report);
	const detailsSummary = report.source ? 'Additional diagnostics' : 'Technical details';
	const componentId = useId();
	const titleId = `${componentId}-title`;
	const descriptionId = `${componentId}-description`;
	const sourceTitleId = `${componentId}-source-title`;
	const overlayElement = useRef<HTMLDivElement | null>(null);
	const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(null);

	const getFocusableElements = (): HTMLElement[] => {
		if (!dialogElement) return [];

		return Array.from(dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
			(element) => element.getAttribute('aria-hidden') !== 'true'
		);
	};

	const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
		if (event.key !== 'Tab' || !dialogElement) return;

		const focusableElements = getFocusableElements();
		if (focusableElements.length === 0) {
			event.preventDefault();
			dialogElement.focus({ preventScroll: true });
			return;
		}

		const firstElement = focusableElements[0]!;
		const lastElement = focusableElements[focusableElements.length - 1]!;
		const activeElement = document.activeElement;
		const focusIsOutsideDialog =
			!(activeElement instanceof Node) || !dialogElement.contains(activeElement);

		if (
			event.shiftKey &&
			(activeElement === firstElement || activeElement === dialogElement || focusIsOutsideDialog)
		) {
			event.preventDefault();
			lastElement.focus();
			return;
		}

		if (
			!event.shiftKey &&
			(activeElement === lastElement || activeElement === dialogElement || focusIsOutsideDialog)
		) {
			event.preventDefault();
			firstElement.focus();
		}
	};

	useEffect(() => {
		if (!dialogElement) return;

		const portalRoot = overlayElement.current?.parentElement;
		if (!portalRoot) return;

		return registerErrorOverlay({ dialog: dialogElement, portalRoot, onDismiss });
	}, [dialogElement, onDismiss]);

	return (
		<Portal>
			<div ref={overlayElement} className="motiongpu-error-overlay" role="presentation">
				<div className="motiongpu-error-dialog-shell" role="presentation">
					<div
						ref={setDialogElement}
						className="motiongpu-error-dialog"
						role="alertdialog"
						aria-modal="true"
						aria-labelledby={titleId}
						aria-describedby={descriptionId}
						tabIndex={-1}
						data-testid="motiongpu-error"
						onKeyDown={handleDialogKeyDown}
					>
						<header className="motiongpu-error-header">
							<div className="motiongpu-error-header-top">
								<div className="motiongpu-error-header-copy">
									<h2 id={titleId} className="motiongpu-error-title">
										{report.title}
									</h2>
									<p className="motiongpu-error-recoverable">
										Recoverable: <span>{report.recoverable ? 'yes' : 'no'}</span>
									</p>
								</div>
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
						</header>
						<div id={descriptionId} className="motiongpu-error-body">
							{model.displayMessage.length > 0 ? (
								<p className="motiongpu-error-message">{model.displayMessage}</p>
							) : null}
							<p className="motiongpu-error-hint">{report.hint}</p>
						</div>

						{report.source ? (
							<section className="motiongpu-error-source" aria-labelledby={sourceTitleId}>
								<h3 id={sourceTitleId} className="motiongpu-error-source-title">
									Source
								</h3>
								<figure className="motiongpu-error-source-frame">
									<figcaption className="motiongpu-error-source-tabs">
										<span className="motiongpu-error-source-tab motiongpu-error-source-tab-active">
											{report.source.location}
											{report.source.column ? `, col ${report.source.column}` : ''}
										</span>
										<span className="motiongpu-error-source-tab-spacer" aria-hidden="true"></span>
									</figcaption>

									<div
										className="motiongpu-error-source-snippet"
										role="region"
										aria-label={`Source code from ${report.source.location}`}
									>
										{report.source.snippet.map((snippetLine) => (
											<div
												key={`snippet-${snippetLine.number}`}
												className={
													snippetLine.highlight
														? 'motiongpu-error-source-row motiongpu-error-source-row-active'
														: 'motiongpu-error-source-row'
												}
											>
												<span className="motiongpu-error-source-line">
													{snippetLine.highlight ? (
														<span className="motiongpu-sr-only">Error line: </span>
													) : null}
													{snippetLine.number}
												</span>
												<span className="motiongpu-error-source-code">
													{snippetLine.code || ' '}
												</span>
											</div>
										))}
									</div>
								</figure>
							</section>
						) : null}

						<div className="motiongpu-error-sections">
							{report.details.length > 0 ? (
								<details className="motiongpu-error-details" open>
									<summary>
										<ChevronDownIcon />
										<span>{detailsSummary}</span>
									</summary>
									<pre>{report.details.join('\n')}</pre>
								</details>
							) : null}
							{report.stack.length > 0 ? (
								<details className="motiongpu-error-details">
									<summary>
										<ChevronDownIcon />
										<span>Stack trace</span>
									</summary>
									<pre>{report.stack.join('\n')}</pre>
								</details>
							) : null}
							{report.context ? (
								<details className="motiongpu-error-details">
									<summary>
										<ChevronDownIcon />
										<span>Runtime context</span>
									</summary>
									<pre>{model.runtimeContextText}</pre>
								</details>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</Portal>
	);
}
