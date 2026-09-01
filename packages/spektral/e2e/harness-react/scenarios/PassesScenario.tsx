import { useCallback, useEffect, useState } from 'react';
import { FragCanvas, PingPongShaderPass, ShaderPass, defineMaterial } from '../../../src/lib/react';
import type { SpektralErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { AnyPass, RenderTargetDefinitionMap } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { RuntimeProbe, type RuntimeControls } from '../RuntimeProbe';

const contextMaterial = defineMaterial({
	fragment: `
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn frag(uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(contextUv * 0.6, distance(contextUv, uv), 1.0);
}
`,
	textures: {
		fluid: { format: 'rgba16float', filter: 'nearest' }
	}
});

const feedbackMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return textureSample(fluid, fluidSampler, uv);
}
`,
	textures: {
		fluid: { format: 'rgba16float', filter: 'nearest' }
	}
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
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(contextUv.x, contextUv.y * 0.8, distance(contextUv, uv), inputColor.a);
}
`
});

const namedReadPass = new ShaderPass({
	needsSwap: false,
	input: 'fxMain',
	output: 'canvas',
	fragment: `
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(inputColor.r * 0.9, contextUv.y * 0.8, distance(contextUv, uv), inputColor.a);
}
`
});

const feedbackPass = new PingPongShaderPass({
	target: 'fluid',
	width: 160,
	height: 110,
	format: 'rgba16float',
	filter: 'nearest',
	fragment: `
fn getFragmentUv() -> vec2f {
	return spektralFragment.uv;
}

fn frag(uv: vec2f) -> vec4f {
	let contextUv = getFragmentUv();
	return vec4f(contextUv.x * 0.8, contextUv.y, distance(contextUv, uv), 1.0);
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
	const [material, setMaterial] = useState<FragMaterial>(contextMaterial);
	const [passes, setPasses] = useState<AnyPass[]>([]);
	const [passMode, setPassMode] = useState<'none' | 'invert' | 'named' | 'feedback'>('none');
	const [renderMode, setRenderMode] = useState<'always' | 'on-demand' | 'manual'>('manual');
	const [lastError, setLastError] = useState('none');

	const handleError = useCallback((report: SpektralErrorReport): void => {
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
						setMaterial(contextMaterial);
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
						setMaterial(contextMaterial);
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
						setMaterial(contextMaterial);
						setPasses([namedWritePass, namedReadPass]);
						setPassMode('named');
					}}
				>
					named pass
				</button>
				<button
					className="harness-button"
					data-testid="set-pass-feedback"
					onClick={() => {
						setMaterial(feedbackMaterial);
						setPasses([feedbackPass]);
						setPassMode('feedback');
					}}
				>
					feedback pass
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
