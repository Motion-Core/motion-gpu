import { useState } from 'react';
import { SpektralErrorOverlay } from '../../../src/lib/react/SpektralErrorOverlay';
import { errorOverlayStyleReport } from '../../error-overlay-style-report';
import '../../error-overlay-host-cascade.css';

export function ErrorOverlayStyleScenario() {
	const [visible, setVisible] = useState(true);

	return visible ? (
		<SpektralErrorOverlay report={errorOverlayStyleReport} onDismiss={() => setVisible(false)} />
	) : null;
}
