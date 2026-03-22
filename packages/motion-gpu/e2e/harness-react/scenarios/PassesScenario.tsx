import { useCallback, useEffect, useState } from 'react';
import { FragCanvas, ShaderPass, defineMaterial } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { RenderPass, RenderTargetDefinitionMap } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { RuntimeProbe, type RuntimeControls } from '../RuntimeProbe';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(0.2, 0.3, 0.4, 1.0);
}
`
});

const invertPass = new ShaderPass({
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(vec3f(1.0) - inputColor.rgb, inputColor.a);
}
`
});

const namedWritePass = new ShaderPass({
	needsSwap: false,
	output: 'fxMain',
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv.x + 0.2, uv.y + 0.3, 0.8), inputColor.a);
}
`
});

const namedReadPass = new ShaderPass({
	needsSwap: false,
	input: 'fxMain',
	output: 'canvas',
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.bgr, inputColor.a);
}
`
});

const renderTargets: RenderTargetDefinitionMap = {
	fxMain: { scale: 1 }
};

export function PassesScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const [controls, setControls] = useState<RuntimeControls | null>(null);
	const [frameCount, setFrameCount] = useState(0);
	const [passes, setPasses] = useState<RenderPass[]>([]);
	const [passMode, setPassMode] = useState<'none' | 'invert' | 'named'>('none');
	const [renderMode, setRenderMode] = useState<'always' | 'on-demand' | 'manual'>('manual');
	const [lastError, setLastError] = useState('none');

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback((nextControls: RuntimeControls): void => {
		setControls(nextControls);
		nextControls.setRenderMode('manual');
		setRenderMode('manual');
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
				<div data-testid="render-mode">{renderMode}</div>
				<div data-testid="last-error">{lastError}</div>
				<div data-testid="pass-mode">{passMode}</div>

				<button
					className="harness-button"
					data-testid="set-pass-none"
					onClick={() => {
						setPasses([]);
						setPassMode('none');
					}}
				>
					no pass
				</button>
				<button
					className="harness-button"
					data-testid="set-pass-invert"
					onClick={() => {
						setPasses([invertPass]);
						setPassMode('invert');
					}}
				>
					invert pass
				</button>
				<button
					className="harness-button"
					data-testid="set-pass-named"
					onClick={() => {
						setPasses([namedWritePass, namedReadPass]);
						setPassMode('named');
					}}
				>
					named pass
				</button>
				<button
					className="harness-button"
					data-testid="advance-once"
					onClick={() => controls?.advance()}
				>
					advance
				</button>
			</section>

			<div className="canvas-shell">
				<FragCanvas
					material={material}
					passes={passes}
					renderTargets={renderTargets}
					showErrorOverlay={false}
					onError={handleError}
				>
					<RuntimeProbe onFrame={setFrameCount} onReady={handleReady} />
				</FragCanvas>
			</div>
		</main>
	);
}
