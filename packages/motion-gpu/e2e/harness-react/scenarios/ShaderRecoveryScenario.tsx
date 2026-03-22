import { useCallback, useEffect, useState } from 'react';
import { FragCanvas, defineMaterial } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { RuntimeProbe, type RuntimeControls } from '../RuntimeProbe';

const goodMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let pulse = fract(motiongpuFrame.time * 0.4);
	return vec4f(pulse, uv.y, 0.4, 1.0);
}
`
});

const badMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(missingValue.rgb, 1.0);
}
`
});

export function ShaderRecoveryScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const [controls, setControls] = useState<RuntimeControls | null>(null);
	const [frameCount, setFrameCount] = useState(0);
	const [material, setMaterial] = useState<FragMaterial>(goodMaterial);
	const [errorCount, setErrorCount] = useState(0);
	const [lastError, setLastError] = useState('none');

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		setErrorCount((count) => count + 1);
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback((nextControls: RuntimeControls): void => {
		setControls(nextControls);
		nextControls.setRenderMode('always');
	}, []);

	useEffect(() => {
		void detectGpuStatus().then((status) => {
			setGpuStatus(status);
		});
	}, []);

	return (
		<main className="harness-main">
			<section className="harness-controls">
				<div data-testid="gpu-status">{gpuStatus}</div>
				<div data-testid="controls-ready">{controls ? 'yes' : 'no'}</div>
				<div data-testid="frame-count">{frameCount}</div>
				<div data-testid="error-count">{errorCount}</div>
				<div data-testid="last-error">{lastError}</div>

				<button
					className="harness-button"
					data-testid="set-bad-material"
					onClick={() => setMaterial(badMaterial)}
				>
					set bad material
				</button>
				<button
					className="harness-button"
					data-testid="set-good-material"
					onClick={() => setMaterial(goodMaterial)}
				>
					set good material
				</button>
			</section>

			<div className="canvas-shell">
				<FragCanvas material={material} showErrorOverlay={false} onError={handleError}>
					<RuntimeProbe onFrame={setFrameCount} onReady={handleReady} />
				</FragCanvas>
			</div>
		</main>
	);
}
