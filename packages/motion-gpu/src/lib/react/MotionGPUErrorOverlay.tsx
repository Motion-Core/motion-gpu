import type { MotionGPUErrorReport } from '../core/error-report.js';
import { Portal } from './Portal.js';

interface MotionGPUErrorOverlayProps {
	report: MotionGPUErrorReport;
}

/**
 * React implementation placeholder. Full runtime wiring is implemented in a follow-up step.
 */
export function MotionGPUErrorOverlay({ report }: MotionGPUErrorOverlayProps) {
	return (
		<Portal>
			<div data-testid="motiongpu-error" role="alertdialog">
				<strong>{report.title}</strong>
				<p>{report.message}</p>
			</div>
		</Portal>
	);
}
