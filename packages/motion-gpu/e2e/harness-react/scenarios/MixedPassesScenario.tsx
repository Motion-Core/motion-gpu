import { useCallback, useEffect, useRef, useState } from 'react';
import { FragCanvas, ComputePass, ShaderPass, defineMaterial } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { AnyPass } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { RuntimeProbe, type RuntimeControls } from '../RuntimeProbe';

const materialWithStorage = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
	storageBuffers: {
		data: { type: 'array<f32>', size: 256, access: 'read-write' }
	}
});

/* ───── shader passes ───── */

const redShiftPass = new ShaderPass({
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.r + 0.3, inputColor.g * 0.7, inputColor.b * 0.7, inputColor.a);
}
`
});

const greenShiftPass = new ShaderPass({
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.r * 0.7, inputColor.g + 0.3, inputColor.b * 0.7, inputColor.a);
}
`
});

const blueShiftPass = new ShaderPass({
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.r * 0.7, inputColor.g * 0.7, inputColor.b + 0.3, inputColor.a);
}
`
});

const badShaderPass = new ShaderPass({
	fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(UNDEFINED_VALUE.rgb, 1.0);
}
`
});

/* ───── compute pass ───── */

const computePass = new ComputePass({
	compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.01;
	}
}
`,
	dispatch: [4, 1, 1]
});

type PassConfig =
	| 'none'
	| 'single-shader'
	| 'chain-3'
	| 'compute-only'
	| 'compute-plus-shader'
	| 'toggle-middle'
	| 'bad-shader-pass'
	| 'multi-error';

export function MixedPassesScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const [controls, setControls] = useState<RuntimeControls | null>(null);
	const [frameCount, setFrameCount] = useState(0);
	const [lastError, setLastError] = useState('none');
	const [errorCount, setErrorCount] = useState(0);
	const [passConfig, setPassConfig] = useState<PassConfig>('none');
	const [activePasses, setActivePasses] = useState<AnyPass[]>([]);
	const [passCount, setPassCount] = useState(0);

	const errorCountRef = useRef(0);

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		errorCountRef.current += 1;
		setErrorCount(errorCountRef.current);
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback((nextControls: RuntimeControls): void => {
		setControls(nextControls);
		nextControls.setRenderMode('manual');
	}, []);

	function applyConfig(config: PassConfig): void {
		setPassConfig(config);
		let nextPasses: AnyPass[];

		switch (config) {
			case 'none':
				nextPasses = [];
				break;
			case 'single-shader':
				redShiftPass.enabled = true;
				nextPasses = [redShiftPass];
				break;
			case 'chain-3':
				redShiftPass.enabled = true;
				greenShiftPass.enabled = true;
				blueShiftPass.enabled = true;
				nextPasses = [redShiftPass, greenShiftPass, blueShiftPass];
				break;
			case 'compute-only':
				computePass.enabled = true;
				nextPasses = [computePass];
				break;
			case 'compute-plus-shader':
				computePass.enabled = true;
				redShiftPass.enabled = true;
				nextPasses = [computePass, redShiftPass];
				break;
			case 'toggle-middle':
				redShiftPass.enabled = true;
				greenShiftPass.enabled = false;
				blueShiftPass.enabled = true;
				nextPasses = [redShiftPass, greenShiftPass, blueShiftPass];
				break;
			case 'bad-shader-pass':
				badShaderPass.enabled = true;
				nextPasses = [badShaderPass];
				break;
			case 'multi-error':
				badShaderPass.enabled = true;
				nextPasses = [badShaderPass];
				break;
			default:
				nextPasses = [];
		}

		setActivePasses(nextPasses);
		setPassCount(nextPasses.length);
	}

	function toggleMiddlePass(): void {
		greenShiftPass.enabled = !greenShiftPass.enabled;
		setActivePasses((prev) => [...prev]);
	}

	useEffect(() => {
		void detectGpuStatus().then(setGpuStatus);
	}, []);

	return (
		<main className="harness-main">
			<section className="harness-controls">
				<div data-testid="gpu-status">{gpuStatus}</div>
				<div data-testid="controls-ready">{controls ? 'yes' : 'no'}</div>
				<div data-testid="frame-count">{frameCount}</div>
				<div data-testid="last-error">{lastError}</div>
				<div data-testid="error-count">{errorCount}</div>
				<div data-testid="pass-config">{passConfig}</div>
				<div data-testid="pass-count">{passCount}</div>

				<button
					className="harness-button"
					data-testid="set-config-none"
					onClick={() => applyConfig('none')}
				>
					none
				</button>
				<button
					className="harness-button"
					data-testid="set-config-single-shader"
					onClick={() => applyConfig('single-shader')}
				>
					single shader
				</button>
				<button
					className="harness-button"
					data-testid="set-config-chain-3"
					onClick={() => applyConfig('chain-3')}
				>
					chain 3
				</button>
				<button
					className="harness-button"
					data-testid="set-config-compute-only"
					onClick={() => applyConfig('compute-only')}
				>
					compute only
				</button>
				<button
					className="harness-button"
					data-testid="set-config-compute-plus-shader"
					onClick={() => applyConfig('compute-plus-shader')}
				>
					compute+shader
				</button>
				<button
					className="harness-button"
					data-testid="set-config-toggle-middle"
					onClick={() => applyConfig('toggle-middle')}
				>
					toggle middle
				</button>
				<button
					className="harness-button"
					data-testid="set-config-bad-shader-pass"
					onClick={() => applyConfig('bad-shader-pass')}
				>
					bad shader pass
				</button>
				<button
					className="harness-button"
					data-testid="set-config-multi-error"
					onClick={() => applyConfig('multi-error')}
				>
					multi error
				</button>

				<button
					className="harness-button"
					data-testid="toggle-middle-pass"
					onClick={toggleMiddlePass}
				>
					toggle green pass
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
					data-testid="set-mode-always"
					onClick={() => {
						controls?.setRenderMode('always');
					}}
				>
					always
				</button>
				<button
					className="harness-button"
					data-testid="set-mode-manual"
					onClick={() => {
						controls?.setRenderMode('manual');
					}}
				>
					manual
				</button>
			</section>

			<div className="canvas-shell">
				<FragCanvas
					material={materialWithStorage}
					passes={activePasses}
					renderMode="manual"
					showErrorOverlay={false}
					onError={handleError}
				>
					<RuntimeProbe onFrame={setFrameCount} onReady={handleReady} />
				</FragCanvas>
			</div>
		</main>
	);
}
