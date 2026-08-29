import { useState } from 'react';
import { MotionGPUErrorOverlay } from '../../../src/lib/react/MotionGPUErrorOverlay';
import { errorOverlayStyleReport } from '../../error-overlay-style-report';
import '../../error-overlay-host-cascade.css';

export function ErrorOverlayStyleScenario() {
	const [visible, setVisible] = useState(true);

	return visible ? (
		<MotionGPUErrorOverlay report={errorOverlayStyleReport} onDismiss={() => setVisible(false)} />
	) : null;
}
