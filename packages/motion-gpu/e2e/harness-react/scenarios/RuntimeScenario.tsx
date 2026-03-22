import { useCallback, useEffect, useState } from 'react';
import { FragCanvas, defineMaterial } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { OutputColorSpace, RenderMode } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { RuntimeProbe, type RuntimeControls } from '../RuntimeProbe';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let pulse = fract(motiongpuFrame.time * 0.5);
	return vec4f(pulse, 0.1, 0.2, 1.0);
}
`
});

export function RuntimeScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const [frameCount, setFrameCount] = useState(0);
	const [renderMode, setRenderMode] = useState<RenderMode>('always');
	const [outputColorSpace, setOutputColorSpace] = useState<OutputColorSpace>('srgb');
	const [lastError, setLastError] = useState('none');
	const [controls, setControls] = useState<RuntimeControls | null>(null);

	const setMode = useCallback(
		(mode: RenderMode): void => {
			if (!controls) {
				return;
			}

			controls.setRenderMode(mode);
			setRenderMode(mode);
		},
		[controls]
	);

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback(
		(nextControls: RuntimeControls): void => {
			setControls(nextControls);
			nextControls.setRenderMode(renderMode);
		},
		[renderMode]
	);

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
				<div data-testid="render-mode">{renderMode}</div>
				<div data-testid="output-color-space">{outputColorSpace}</div>
				<div data-testid="last-error">{lastError}</div>

				<button
					className="harness-button"
					data-testid="set-mode-always"
					onClick={() => setMode('always')}
				>
					always
				</button>
				<button
					className="harness-button"
					data-testid="set-mode-on-demand"
					onClick={() => setMode('on-demand')}
				>
					on-demand
				</button>
				<button
					className="harness-button"
					data-testid="set-mode-manual"
					onClick={() => setMode('manual')}
				>
					manual
				</button>
				<button
					className="harness-button"
					data-testid="invalidate-once"
					onClick={() => controls?.invalidate()}
				>
					invalidate
				</button>
				<button
					className="harness-button"
					data-testid="advance-once"
					onClick={() => controls?.advance()}
				>
					advance
				</button>
				<button
					className="harness-button"
					data-testid="toggle-output-color-space"
					onClick={() => {
						setOutputColorSpace((current) => (current === 'srgb' ? 'linear' : 'srgb'));
					}}
				>
					toggle output
				</button>
			</section>

			<div className="canvas-shell">
				<FragCanvas
					material={material}
					outputColorSpace={outputColorSpace}
					showErrorOverlay={false}
					onError={handleError}
				>
					<RuntimeProbe onFrame={setFrameCount} onReady={handleReady} />
				</FragCanvas>
			</div>
		</main>
	);
}
