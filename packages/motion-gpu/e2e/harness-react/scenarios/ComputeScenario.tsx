import { useCallback, useEffect, useRef, useState } from 'react';
import {
	FragCanvas,
	ComputePass,
	PingPongComputePass,
	defineMaterial
} from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import type { FragMaterial } from '../../../src/lib/core/material';
import type { AnyPass } from '../../../src/lib/core/types';
import { detectGpuStatus, type GpuStatus } from '../gpu-status';
import { RuntimeProbe, type RuntimeControls } from '../RuntimeProbe';

/* ───── materials ───── */

const materialWithStorageBuffer = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
	storageBuffers: {
		data: { type: 'array<f32>', size: 256, access: 'read-write' }
	}
});

const materialWithStorageTexture = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
	textures: {
		computeOutput: {
			storage: true,
			format: 'rgba8unorm' as GPUTextureFormat,
			width: 64,
			height: 64
		}
	}
});

const materialWithPingPong = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
	storageBuffers: {
		scratch: { type: 'array<f32>', size: 16, access: 'read-write' }
	},
	textures: {
		simulation: {
			storage: true,
			format: 'rgba8unorm' as GPUTextureFormat,
			width: 64,
			height: 64
		}
	}
});

const materialMinimal = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let t = motiongpuFrame.time;
	return vec4f(uv * sin(t * 0.5) * 0.5 + 0.5, 0.5, 1.0);
}
`,
	storageBuffers: {
		particles: { type: 'array<vec4f>', size: 1024, access: 'read-write' }
	}
});

/* ───── compute passes ───── */

const basicComputePass = new ComputePass({
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

const autoDispatchComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.02;
	}
}
`,
	dispatch: 'auto'
});

const dynamicDispatchComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(16, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.03;
	}
}
`,
	dispatch: (ctx) => [Math.ceil(ctx.width / 16), 1, 1]
});

const disabledComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = 999.0;
	}
}
`,
	dispatch: [4, 1, 1],
	enabled: false
});

const storageTextureComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = vec2u(id.x, id.y);
	let dims = textureDimensions(computeOutput);
	if (pos.x < dims.x && pos.y < dims.y) {
		let uv = vec2f(f32(pos.x) / f32(dims.x), f32(pos.y) / f32(dims.y));
		textureStore(computeOutput, pos, vec4f(uv, 0.5, 1.0));
	}
}
`,
	dispatch: [8, 8, 1]
});

const pingPongComputePass = new PingPongComputePass({
	compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = id.xy;
	let dims = textureDimensions(simulationA);
	if (pos.x < dims.x && pos.y < dims.y) {
		let prev = textureLoad(simulationA, vec2i(pos), 0);
		let next = prev * 0.99 + vec4f(0.01, 0.0, 0.0, 0.0);
		textureStore(simulationB, pos, next);
	}
}
`,
	target: 'simulation',
	iterations: 1,
	dispatch: [8, 8, 1]
});

const pingPongMultiIterComputePass = new PingPongComputePass({
	compute: `
@compute @workgroup_size(8, 8, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let pos = id.xy;
	let dims = textureDimensions(simulationA);
	if (pos.x < dims.x && pos.y < dims.y) {
		let prev = textureLoad(simulationA, vec2i(pos), 0);
		let next = prev * 0.98 + vec4f(0.02, 0.0, 0.0, 0.0);
		textureStore(simulationB, pos, next);
	}
}
`,
	target: 'simulation',
	iterations: 4,
	dispatch: [8, 8, 1]
});

const particleComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&particles)) {
		let t = motiongpuFrame.time;
		particles[idx] = vec4f(sin(t + f32(idx)), cos(t + f32(idx)), 0.0, 1.0);
	}
}
`,
	dispatch: [4, 1, 1]
});

const badComputePass = new ComputePass({
	compute: `
@compute @workgroup_size(64, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = UNDEFINED_SYMBOL;
	}
}
`,
	dispatch: [1]
});

/* ───── component ───── */

type ComputeMode =
	| 'none'
	| 'basic'
	| 'auto-dispatch'
	| 'dynamic-dispatch'
	| 'disabled'
	| 'storage-texture'
	| 'ping-pong'
	| 'ping-pong-multi'
	| 'particle'
	| 'bad-shader'
	| 'hot-swap'
	| 'toggle-enabled';

export function ComputeScenario() {
	const [gpuStatus, setGpuStatus] = useState<GpuStatus>('checking');
	const [controls, setControls] = useState<RuntimeControls | null>(null);
	const [frameCount, setFrameCount] = useState(0);
	const [lastError, setLastError] = useState('none');
	const [errorCount, setErrorCount] = useState(0);
	const [computeMode, setComputeMode] = useState<ComputeMode>('none');
	const [renderMode, setRenderMode] = useState<'always' | 'on-demand' | 'manual'>('manual');
	const [activePasses, setActivePasses] = useState<AnyPass[]>([]);
	const [activeMaterial, setActiveMaterial] = useState<FragMaterial>(materialWithStorageBuffer);

	const errorCountRef = useRef(0);

	const handleError = useCallback((report: MotionGPUErrorReport): void => {
		errorCountRef.current += 1;
		setErrorCount(errorCountRef.current);
		setLastError(`${report.title}: ${report.rawMessage}`);
	}, []);

	const handleReady = useCallback((nextControls: RuntimeControls): void => {
		setControls(nextControls);
		nextControls.setRenderMode('manual');
		setRenderMode('manual');
	}, []);

	useEffect(() => {
		void detectGpuStatus().then(setGpuStatus);
	}, []);

	function applyMode(mode: ComputeMode): void {
		setComputeMode(mode);

		switch (mode) {
			case 'none':
				setActivePasses([]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'basic':
				setActivePasses([basicComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'auto-dispatch':
				setActivePasses([autoDispatchComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'dynamic-dispatch':
				setActivePasses([dynamicDispatchComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'disabled':
				setActivePasses([disabledComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'storage-texture':
				setActivePasses([storageTextureComputePass]);
				setActiveMaterial(materialWithStorageTexture);
				break;
			case 'ping-pong':
				setActivePasses([pingPongComputePass]);
				setActiveMaterial(materialWithPingPong);
				break;
			case 'ping-pong-multi':
				setActivePasses([pingPongMultiIterComputePass]);
				setActiveMaterial(materialWithPingPong);
				break;
			case 'particle':
				setActivePasses([particleComputePass]);
				setActiveMaterial(materialMinimal);
				break;
			case 'bad-shader':
				setActivePasses([badComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'hot-swap':
				setActivePasses([basicComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
			case 'toggle-enabled':
				basicComputePass.enabled = true;
				setActivePasses([basicComputePass]);
				setActiveMaterial(materialWithStorageBuffer);
				break;
		}
	}

	return (
		<main className="harness-main">
			<section className="harness-controls">
				<div data-testid="gpu-status">{gpuStatus}</div>
				<div data-testid="controls-ready">{controls ? 'yes' : 'no'}</div>
				<div data-testid="frame-count">{frameCount}</div>
				<div data-testid="render-mode">{renderMode}</div>
				<div data-testid="last-error">{lastError}</div>
				<div data-testid="error-count">{errorCount}</div>
				<div data-testid="compute-mode">{computeMode}</div>
				<div data-testid="pass-count">{activePasses.length}</div>

				<button
					className="harness-button"
					data-testid="set-compute-none"
					onClick={() => applyMode('none')}
				>
					none
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-basic"
					onClick={() => applyMode('basic')}
				>
					basic
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-auto-dispatch"
					onClick={() => applyMode('auto-dispatch')}
				>
					auto dispatch
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-dynamic-dispatch"
					onClick={() => applyMode('dynamic-dispatch')}
				>
					dynamic dispatch
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-disabled"
					onClick={() => applyMode('disabled')}
				>
					disabled
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-storage-texture"
					onClick={() => applyMode('storage-texture')}
				>
					storage texture
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-ping-pong"
					onClick={() => applyMode('ping-pong')}
				>
					ping-pong
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-ping-pong-multi"
					onClick={() => applyMode('ping-pong-multi')}
				>
					ping-pong multi
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-particle"
					onClick={() => applyMode('particle')}
				>
					particle
				</button>
				<button
					className="harness-button"
					data-testid="set-compute-bad-shader"
					onClick={() => applyMode('bad-shader')}
				>
					bad shader
				</button>

				<button
					className="harness-button"
					data-testid="hot-swap-compute"
					onClick={() => {
						basicComputePass.setCompute(`
@compute @workgroup_size(32, 1, 1)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let idx = id.x;
	if (idx < arrayLength(&data)) {
		data[idx] = f32(idx) * 0.99;
	}
}
`);
						setComputeMode('hot-swap');
					}}
				>
					hot swap
				</button>

				<button
					className="harness-button"
					data-testid="toggle-compute-enabled"
					onClick={() => {
						basicComputePass.enabled = !basicComputePass.enabled;
						setComputeMode('toggle-enabled');
						setActivePasses((prev) => [...prev]);
					}}
				>
					toggle enabled
				</button>

				<button
					className="harness-button"
					data-testid="set-dispatch-override"
					onClick={() => {
						basicComputePass.setDispatch([8, 2, 1]);
						setComputeMode('basic');
						setActivePasses((prev) => [...prev]);
					}}
				>
					dispatch override
				</button>

				<button
					className="harness-button"
					data-testid="set-mode-always"
					onClick={() => {
						controls?.setRenderMode('always');
						setRenderMode('always');
					}}
				>
					always
				</button>
				<button
					className="harness-button"
					data-testid="set-mode-manual"
					onClick={() => {
						controls?.setRenderMode('manual');
						setRenderMode('manual');
					}}
				>
					manual
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
					material={activeMaterial}
					passes={activePasses}
					showErrorOverlay={false}
					onError={handleError}
				>
					<RuntimeProbe onFrame={setFrameCount} onReady={handleReady} />
				</FragCanvas>
			</div>
		</main>
	);
}
