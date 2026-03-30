import { useCallback, useEffect, useRef, useState } from 'react';
import { FragCanvas, defineMaterial, useFrame, useMotionGPU, useTexture } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { RenderMode } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { useCurrent } from '../use-current';

const simpleMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let center = vec2f(0.5, 0.5);
	if (distance(uv, center) > 0.35) {
		discard;
	}
	return vec4f(uv, 0.5, 1.0);
}
`
});

const texturedMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return textureSample(artwork, artworkSampler, uv);
}
`,
	textures: {
		artwork: {}
	}
});

function createTestTextureUrl(): string {
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = 4;
	const context = canvas.getContext('2d');
	if (!context) {
		return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
	}

	context.fillStyle = '#ff6600';
	context.fillRect(0, 0, 4, 4);
	context.fillStyle = '#0066ff';
	context.fillRect(0, 0, 2, 2);
	context.fillStyle = '#00ff66';
	context.fillRect(2, 2, 2, 2);
	return canvas.toDataURL('image/png');
}

const TEST_TEXTURE_URL = createTestTextureUrl();

interface LifecycleProbeControls {
	setRenderMode: (mode: RenderMode) => void;
	invalidate: () => void;
	advance: () => void;
	startFrameCallback: () => void;
	stopFrameCallback: () => void;
}

interface LifecycleProbeProps {
	onFrame: (count: number) => void;
	onReady: (controls: LifecycleProbeControls) => void;
}

function LifecycleProbe({ onFrame, onReady }: LifecycleProbeProps) {
	const context = useMotionGPU();
	const frameCountRef = useRef(0);
	const onFrameRef = useRef(onFrame);

	useEffect(() => {
		onFrameRef.current = onFrame;
	}, [onFrame]);

	const handleFrame = useCallback(() => {
		frameCountRef.current += 1;
		onFrameRef.current(frameCountRef.current);
	}, []);

	const { start, stop } = useFrame(handleFrame, { autoInvalidate: false });

	useEffect(() => {
		onReady({
			setRenderMode: (mode) => context.renderMode.set(mode),
			invalidate: context.invalidate,
			advance: context.advance,
			startFrameCallback: start,
			stopFrameCallback: stop
		});
	}, [context, onReady, start, stop]);

	return null;
}

type ClearColorMode = 'red' | 'blue' | 'default';
type SceneMode = 'simple' | 'textured';

export function LifecycleScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const controlsRef = useRef<LifecycleProbeControls | null>(null);
	const [controlsReady, setControlsReady] = useState(false);
	const [frameCount, setFrameCount] = useState(0);
	const [lastError, setLastError] = useState('none');
	const [clearColorMode, setClearColorMode] = useState<ClearColorMode>('default');
	const [sceneMode, setSceneMode] = useState<SceneMode>('simple');
	const [frameCallbackRunning, setFrameCallbackRunning] = useState(true);
	const [activeMaterial, setActiveMaterial] = useState<FragMaterial>(simpleMaterial);
	const [clearColor, setClearColor] = useState<[number, number, number, number]>([0, 0, 0, 1]);

	const [textureUrls] = useState<string[]>(() => [TEST_TEXTURE_URL]);
	const textureResult = useTexture(() => textureUrls);
	const textureLoading = useCurrent(textureResult.loading);
	const textures = useCurrent(textureResult.textures);

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback((nextControls: LifecycleProbeControls): void => {
		controlsRef.current = nextControls;
		setControlsReady(true);
		nextControls.setRenderMode('manual');
	}, []);

	function applyClearColor(mode: ClearColorMode): void {
		setClearColorMode(mode);
		switch (mode) {
			case 'red':
				setClearColor([1, 0, 0, 1]);
				break;
			case 'blue':
				setClearColor([0, 0, 1, 1]);
				break;
			case 'default':
				setClearColor([0, 0, 0, 1]);
				break;
		}
	}

	function applySceneMode(mode: SceneMode): void {
		setSceneMode(mode);
		setActiveMaterial(mode === 'textured' ? texturedMaterial : simpleMaterial);
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
				<div data-testid="clear-color-mode">{clearColorMode}</div>
				<div data-testid="scene-mode">{sceneMode}</div>
				<div data-testid="frame-callback-running">{frameCallbackRunning ? 'yes' : 'no'}</div>
				<div data-testid="texture-loading">{textureLoading ? 'yes' : 'no'}</div>
				<div data-testid="texture-count">{textures?.length ?? 0}</div>

				<button className="harness-button" data-testid="set-clear-red" onClick={() => applyClearColor('red')}>clear red</button>
				<button className="harness-button" data-testid="set-clear-blue" onClick={() => applyClearColor('blue')}>clear blue</button>
				<button className="harness-button" data-testid="set-clear-default" onClick={() => applyClearColor('default')}>clear default</button>

				<button className="harness-button" data-testid="set-scene-simple" onClick={() => applySceneMode('simple')}>simple</button>
				<button className="harness-button" data-testid="set-scene-textured" onClick={() => applySceneMode('textured')}>textured</button>

				<button
					className="harness-button"
					data-testid="start-frame-callback"
					onClick={() => {
						setFrameCallbackRunning(true);
						controlsRef.current?.startFrameCallback();
					}}
				>
					start callback
				</button>
				<button
					className="harness-button"
					data-testid="stop-frame-callback"
					onClick={() => {
						setFrameCallbackRunning(false);
						controlsRef.current?.stopFrameCallback();
					}}
				>
					stop callback
				</button>

				<button className="harness-button" data-testid="advance-once" onClick={() => controlsRef.current?.advance()}>advance</button>
				<button className="harness-button" data-testid="set-mode-always" onClick={() => controlsRef.current?.setRenderMode('always')}>always</button>
				<button className="harness-button" data-testid="set-mode-manual" onClick={() => controlsRef.current?.setRenderMode('manual')}>manual</button>
			</section>

			<div className="canvas-shell">
				<FragCanvas material={activeMaterial} clearColor={clearColor} showErrorOverlay={false} onError={handleError}>
					<LifecycleProbe onFrame={setFrameCount} onReady={handleReady} />
				</FragCanvas>
			</div>
		</main>
	);
}
