import { useCallback, useEffect, useRef, useState } from 'react';
import { FragCanvas, defineMaterial, useFrame, useMotionGPU } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { FrameState, RenderMode, UniformValue } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';

const materialWithUniform = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(motiongpuUniforms.brightness * uv.x, 0.1, 0.2, 1.0);
}
`,
	uniforms: {
		brightness: 0.5
	}
});

const materialAlternate = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(0.1, motiongpuUniforms.brightness * uv.y, 0.8, 1.0);
}
`,
	uniforms: {
		brightness: 0.5
	}
});

const materialWithDefinesOn = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	if USE_ALTERNATE {
		return vec4f(0.0, 0.0, 1.0, 1.0);
	}
	return vec4f(1.0, 0.0, 0.0, 1.0);
}
`,
	defines: {
		USE_ALTERNATE: true
	}
});

const materialWithDefinesOff = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	if USE_ALTERNATE {
		return vec4f(0.0, 0.0, 1.0, 1.0);
	}
	return vec4f(1.0, 0.0, 0.0, 1.0);
}
`,
	defines: {
		USE_ALTERNATE: false
	}
});

interface UniformProbeControls {
	setRenderMode: (mode: RenderMode) => void;
	invalidate: () => void;
	advance: () => void;
}

interface UniformProbeProps {
	onFrame: (count: number) => void;
	onReady: (controls: UniformProbeControls) => void;
	uniformName: string | null;
	uniformValue: UniformValue;
}

function UniformProbe({ onFrame, onReady, uniformName, uniformValue }: UniformProbeProps) {
	const context = useMotionGPU();
	const frameCountRef = useRef(0);
	const onFrameRef = useRef(onFrame);
	const uniformNameRef = useRef(uniformName);
	const uniformValueRef = useRef(uniformValue);

	useEffect(() => {
		onFrameRef.current = onFrame;
	}, [onFrame]);

	useEffect(() => {
		uniformNameRef.current = uniformName;
		uniformValueRef.current = uniformValue;
	}, [uniformName, uniformValue]);

	const handleFrame = useCallback((state: FrameState) => {
		frameCountRef.current += 1;
		onFrameRef.current(frameCountRef.current);
		if (uniformNameRef.current !== null) {
			state.setUniform(uniformNameRef.current, uniformValueRef.current);
		}
	}, []);

	useFrame(handleFrame, { autoInvalidate: false });

	useEffect(() => {
		onReady({
			setRenderMode: (mode) => context.renderMode.set(mode),
			invalidate: context.invalidate,
			advance: context.advance
		});
	}, [context, onReady]);

	return null;
}

type MaterialMode = 'uniform-a' | 'uniform-b' | 'defines-on' | 'defines-off';

export function UniformsScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const controlsRef = useRef<UniformProbeControls | null>(null);
	const [controlsReady, setControlsReady] = useState(false);
	const [frameCount, setFrameCount] = useState(0);
	const [lastError, setLastError] = useState('none');
	const [materialMode, setMaterialMode] = useState<MaterialMode>('uniform-a');
	const [brightnessLevel, setBrightnessLevel] = useState<'low' | 'high'>('low');
	const [activeMaterial, setActiveMaterial] = useState<FragMaterial>(materialWithUniform);
	const [uniformName, setUniformName] = useState<string | null>('brightness');
	const [uniformValue, setUniformValue] = useState<number>(0.5);

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback((nextControls: UniformProbeControls): void => {
		controlsRef.current = nextControls;
		setControlsReady(true);
		nextControls.setRenderMode('manual');
	}, []);

	function applyMaterial(mode: MaterialMode): void {
		setMaterialMode(mode);
		switch (mode) {
			case 'uniform-a':
				setActiveMaterial(materialWithUniform);
				setUniformName('brightness');
				break;
			case 'uniform-b':
				setActiveMaterial(materialAlternate);
				setUniformName('brightness');
				break;
			case 'defines-on':
				setActiveMaterial(materialWithDefinesOn);
				setUniformName(null);
				break;
			case 'defines-off':
				setActiveMaterial(materialWithDefinesOff);
				setUniformName(null);
				break;
		}
	}

	useEffect(() => {
		void detectGpuStatus().then(setGpuStatus);
	}, []);

	return (
		<main className="harness-main">
			<section className="harness-controls">
				<div data-testid="gpu-status">{gpuStatus}</div>
				<div data-testid="controls-ready">{controlsReady ? 'yes' : 'no'}</div>
				<div data-testid="frame-count">{frameCount}</div>
				<div data-testid="last-error">{lastError}</div>
				<div data-testid="material-mode">{materialMode}</div>
				<div data-testid="brightness-level">{brightnessLevel}</div>

				<button
					className="harness-button"
					data-testid="set-material-a"
					onClick={() => applyMaterial('uniform-a')}
				>
					material A
				</button>
				<button
					className="harness-button"
					data-testid="set-material-b"
					onClick={() => applyMaterial('uniform-b')}
				>
					material B
				</button>
				<button
					className="harness-button"
					data-testid="set-material-defines-on"
					onClick={() => applyMaterial('defines-on')}
				>
					defines ON
				</button>
				<button
					className="harness-button"
					data-testid="set-material-defines-off"
					onClick={() => applyMaterial('defines-off')}
				>
					defines OFF
				</button>

				<button
					className="harness-button"
					data-testid="set-brightness-high"
					onClick={() => {
						setBrightnessLevel('high');
						setUniformValue(1.0);
					}}
				>
					brightness high
				</button>
				<button
					className="harness-button"
					data-testid="set-brightness-low"
					onClick={() => {
						setBrightnessLevel('low');
						setUniformValue(0.1);
					}}
				>
					brightness low
				</button>

				<button
					className="harness-button"
					data-testid="advance-once"
					onClick={() => controlsRef.current?.advance()}
				>
					advance
				</button>
			</section>

			<div className="canvas-shell">
				<FragCanvas material={activeMaterial} showErrorOverlay={false} onError={handleError}>
					<UniformProbe
						onFrame={setFrameCount}
						onReady={handleReady}
						uniformName={uniformName}
						uniformValue={uniformValue}
					/>
				</FragCanvas>
			</div>
		</main>
	);
}
