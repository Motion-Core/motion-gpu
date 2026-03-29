import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef } from 'react';
import { attachShaderCompilationDiagnostics } from '../lib/core/error-diagnostics.js';
import type { MotionGPUErrorReport } from '../lib/core/error-report.js';
import { defineMaterial, type FragMaterial } from '../lib/core/material.js';
import type { RenderMode } from '../lib/core/types.js';
import { FragCanvas } from '../lib/react/FragCanvas.js';
import type { MotionGPUContext } from '../lib/react/motiongpu-context.js';
import { useMotionGPU } from '../lib/react/motiongpu-context.js';
import { useFrame } from '../lib/react/frame-context.js';

const { createRendererMock } = vi.hoisted(() => ({
	createRendererMock: vi.fn()
}));

vi.mock('../lib/core/renderer', () => ({
	createRenderer: createRendererMock
}));

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.5, 1.0);
}
`
});
const alternateMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(1.0 - uv.x, uv.y, 0.2, 1.0);
}
`
});
const runtimeBindingsMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.0, 1.0);
}
`,
	uniforms: {
		uGain: 0
	},
	textures: {
		uTex: {}
	}
});

interface MockRenderer {
	render: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
}

type FrameMutationMode = 'none' | 'valid-both' | 'invalid-uniform' | 'invalid-texture';

let rafQueue: FrameRequestCallback[] = [];

async function flushFrame(timestamp: number): Promise<void> {
	const callback = rafQueue.shift();
	if (!callback) {
		throw new Error('No queued animation frame callback');
	}

	callback(timestamp);
	await Promise.resolve();
	await Promise.resolve();
}

function MotionGPUProbe({ onProbe }: { onProbe: (value: MotionGPUContext) => void }) {
	const context = useMotionGPU();

	useEffect(() => {
		onProbe(context);
	}, [context, onProbe]);

	return null;
}

function MotionGPUWithControlProbe({
	onProbe,
	renderMode = 'always'
}: {
	onProbe: (value: MotionGPUContext) => void;
	renderMode?: RenderMode;
}) {
	const probeMaterial = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.4, 1.0);
}
`
	});

	return (
		<FragCanvas material={probeMaterial} renderMode={renderMode} showErrorOverlay={false}>
			<MotionGPUProbe onProbe={onProbe} />
		</FragCanvas>
	);
}

function FrameMutationProbe({ mode = 'none' }: { mode?: FrameMutationMode }) {
	const runtimeTextureRef = useRef<HTMLCanvasElement | null>(null);
	if (!runtimeTextureRef.current) {
		const canvas = document.createElement('canvas');
		canvas.width = 2;
		canvas.height = 2;
		runtimeTextureRef.current = canvas;
	}
	const appliedModeRef = useRef<FrameMutationMode | null>(null);

	useFrame(
		({ setUniform, setTexture }) => {
			if (mode === 'none' || appliedModeRef.current === mode) {
				return;
			}
			appliedModeRef.current = mode;

			if (mode === 'valid-both') {
				setUniform('uGain', 0.75);
				setTexture('uTex', runtimeTextureRef.current);
				return;
			}

			if (mode === 'invalid-uniform') {
				setUniform('uMissing', 1);
				return;
			}

			setTexture('uMissing', runtimeTextureRef.current);
		},
		{ autoInvalidate: false }
	);

	return null;
}

function FragCanvasFrameMutationHarness({
	material,
	mode = 'none',
	onError,
	onErrorHistory,
	errorHistoryLimit,
	showErrorOverlay = false
}: {
	material: FragMaterial;
	mode?: FrameMutationMode;
	onError?: (report: MotionGPUErrorReport) => void;
	onErrorHistory?: (history: MotionGPUErrorReport[]) => void;
	errorHistoryLimit?: number;
	showErrorOverlay?: boolean;
}) {
	return (
		<FragCanvas
			material={material}
			showErrorOverlay={showErrorOverlay}
			{...(onError ? { onError } : {})}
			{...(onErrorHistory ? { onErrorHistory } : {})}
			{...(errorHistoryLimit !== undefined ? { errorHistoryLimit } : {})}
		>
			<FrameMutationProbe mode={mode} />
		</FragCanvas>
	);
}

describe('React FragCanvas runtime', () => {
	beforeEach(() => {
		rafQueue = [];
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: FrameRequestCallback) => {
				rafQueue.push(callback);
				return rafQueue.length;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		createRendererMock.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('rebuilds renderer when outputColorSpace changes', async () => {
		const created: Array<{ renderer: MockRenderer; options: { outputColorSpace: string } }> = [];
		createRendererMock.mockImplementation(async (options: { outputColorSpace: string }) => {
			const renderer: MockRenderer = {
				render: vi.fn(),
				destroy: vi.fn()
			};
			created.push({ renderer, options });
			return renderer;
		});

		const view = render(<FragCanvas material={material} showErrorOverlay={false} />);

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});

		await flushFrame(32);
		await waitFor(() => {
			expect(created[0]?.renderer.render).toHaveBeenCalled();
		});

		view.rerender(
			<FragCanvas material={material} outputColorSpace="linear" showErrorOverlay={false} />
		);
		await flushFrame(48);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});

		expect(created[1]?.options.outputColorSpace).toBe('linear');
		expect(created[0]?.renderer.destroy).toHaveBeenCalledTimes(1);

		await flushFrame(64);
		await waitFor(() => {
			expect(created[1]?.renderer.render).toHaveBeenCalled();
		});
	});

	it('applies retry backoff after renderer initialization failure and recovers', async () => {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);

		const recoveredRenderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockRejectedValueOnce(new Error('bootstrap failed'));
		createRendererMock.mockResolvedValue(recoveredRenderer);

		const onError = vi.fn();
		render(<FragCanvas material={material} onError={onError} showErrorOverlay={false} />);

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: 'bootstrap failed'
				})
			);
		});

		now = 100;
		await flushFrame(32);
		expect(createRendererMock).toHaveBeenCalledTimes(1);

		now = 300;
		await flushFrame(48);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});

		await flushFrame(64);
		await waitFor(() => {
			expect(recoveredRenderer.render).toHaveBeenCalled();
		});
	});

	it('resets retry backoff immediately when material signature changes', async () => {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);

		const recoveredRenderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockRejectedValueOnce(new Error('bootstrap failed'));
		createRendererMock.mockResolvedValue(recoveredRenderer);

		const view = render(<FragCanvas material={material} showErrorOverlay={false} />);

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});

		now = 120;
		view.rerender(<FragCanvas material={alternateMaterial} showErrorOverlay={false} />);
		await flushFrame(32);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});
	});

	it('does not enqueue duplicate renderer rebuild while previous rebuild is pending', async () => {
		let resolveRenderer!: (renderer: MockRenderer) => void;
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockImplementation(
			() =>
				new Promise<MockRenderer>((resolve) => {
					resolveRenderer = resolve;
				})
		);

		render(<FragCanvas material={material} showErrorOverlay={false} />);

		await flushFrame(16);
		expect(createRendererMock).toHaveBeenCalledTimes(1);
		expect(rafQueue).toHaveLength(0);

		resolveRenderer(renderer);
		await Promise.resolve();
		await Promise.resolve();
		expect(rafQueue.length).toBeGreaterThan(0);
		await flushFrame(32);
		await waitFor(() => {
			expect(renderer.render).toHaveBeenCalledTimes(1);
		});
	});

	it('stops scheduling frames in manual mode while idle and wakes on advance()', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);

		const onProbe = vi.fn();
		render(<MotionGPUWithControlProbe onProbe={onProbe} renderMode="manual" />);

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});
		const context = onProbe.mock.calls[0]?.[0] as MotionGPUContext;

		await flushFrame(16);
		await flushFrame(32);
		expect(renderer.render).toHaveBeenCalledTimes(0);
		expect(rafQueue).toHaveLength(0);

		context.advance();
		expect(rafQueue).toHaveLength(1);
		await flushFrame(48);
		expect(renderer.render).toHaveBeenCalledTimes(1);
		expect(rafQueue).toHaveLength(0);
	});

	it('stops scheduling frames in on-demand idle and wakes on invalidate()', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);

		const onProbe = vi.fn();
		render(<MotionGPUWithControlProbe onProbe={onProbe} renderMode="on-demand" />);

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});
		const context = onProbe.mock.calls[0]?.[0] as MotionGPUContext;

		await flushFrame(16);
		await flushFrame(32);
		expect(renderer.render).toHaveBeenCalledTimes(1);
		expect(rafQueue).toHaveLength(1);

		await flushFrame(48);
		expect(renderer.render).toHaveBeenCalledTimes(1);
		expect(rafQueue).toHaveLength(0);

		context.invalidate();
		expect(rafQueue).toHaveLength(1);
		await flushFrame(64);
		expect(renderer.render).toHaveBeenCalledTimes(2);
	});

	it('wakes frame loop when context renderMode switches to always from manual idle', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);

		const onProbe = vi.fn();
		render(<MotionGPUWithControlProbe onProbe={onProbe} renderMode="manual" />);

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});
		const context = onProbe.mock.calls[0]?.[0] as MotionGPUContext;

		await flushFrame(16);
		await flushFrame(32);
		expect(rafQueue).toHaveLength(0);
		expect(renderer.render).toHaveBeenCalledTimes(0);

		context.renderMode.set('always');
		expect(rafQueue).toHaveLength(1);
		await flushFrame(48);
		expect(renderer.render).toHaveBeenCalledTimes(1);
		expect(rafQueue.length).toBeGreaterThan(0);
	});

	it('stops frame processing after component unmount', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);

		const view = render(<FragCanvas material={material} showErrorOverlay={false} />);
		await flushFrame(16);
		await flushFrame(32);
		expect(renderer.render).toHaveBeenCalledTimes(1);

		view.unmount();
		await flushFrame(48);
		expect(renderer.render).toHaveBeenCalledTimes(1);
	});

	it('renders shader diagnostics source, details and stack in overlay', async () => {
		const diagnosticsError = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nmissing return'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 21,
						message: 'missing return',
						linePos: 6,
						lineLength: 7,
						sourceLocation: { kind: 'fragment', line: 2 }
					},
					{
						generatedLine: 22,
						message: 'expected ;',
						sourceLocation: { kind: 'fragment', line: 3 }
					}
				],
				fragmentSource: [
					'fn frag(uv: vec2f) -> vec4f {',
					'\tlet broken = uv.x',
					'\treturn vec4f(uv, 0.0, 1.0);',
					'}'
				].join('\n'),
				includeSources: {},
				materialSource: { component: 'OverlayScene.svelte' },
				runtimeContext: {
					materialSignature: '{"fragment":"overlay-hash"}',
					passGraph: {
						passCount: 3,
						enabledPassCount: 2,
						inputs: ['source', 'fxMain'],
						outputs: ['fxA', 'canvas']
					},
					activeRenderTargets: ['fxMain', 'fxA']
				}
			}
		);
		diagnosticsError.stack = [
			'Error: WGSL compilation failed',
			'at render (Renderer.ts:42:7)'
		].join('\n');
		const throwingRenderer: MockRenderer = {
			render: vi.fn(() => {
				throw diagnosticsError;
			}),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(throwingRenderer);

		render(<FragCanvas material={material} />);
		await flushFrame(16);
		await flushFrame(32);

		const overlay = await screen.findByTestId('motiongpu-error');
		expect(overlay.textContent).toContain('WGSL compilation failed');
		expect(overlay.textContent).toContain('missing return');
		expect(overlay.textContent).toContain('OverlayScene.svelte (fragment line 2');
		expect(overlay.textContent).toContain('let broken = uv.x');
		expect(overlay.textContent).toContain('Additional diagnostics');
		expect(overlay.textContent).toContain('expected ;');
		expect(overlay.textContent).toContain('Stack trace');
		expect(overlay.textContent).toContain('at render (Renderer.ts:42:7)');
		const metaValues = Array.from(overlay.querySelectorAll('.motiongpu-error-meta-value')).map((value) =>
			value.textContent?.trim()
		);
		expect(metaValues).toContain('WGSL_COMPILATION_FAILED');
		expect(metaValues).toContain('error');
		expect(metaValues).toContain('yes');
		expect(overlay.textContent).toContain('Runtime context');
		expect(overlay.textContent).toContain('materialSignature: {"fragment":"overlay-hash"}');
		expect(overlay.textContent).toContain('passGraph.passCount: 3');
		expect(overlay.textContent).toContain('passGraph.enabledPassCount: 2');
		expect(overlay.textContent).toContain('passGraph.inputs: source, fxMain');
		expect(overlay.textContent).toContain('passGraph.outputs: fxA, canvas');
		expect(overlay.textContent).toContain('activeRenderTargets: fxMain, fxA');
	});

	it('renders include diagnostics location in overlay source header', async () => {
		const diagnosticsError = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nunknown function call'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 25,
						message: 'unknown function call',
						linePos: 4,
						lineLength: 8,
						sourceLocation: { kind: 'include', include: 'tone', line: 2 }
					}
				],
				fragmentSource: [
					'fn frag(uv: vec2f) -> vec4f {',
					'\tlet mapped = tone(uv);',
					'\treturn vec4f(mapped, 1.0);',
					'}'
				].join('\n'),
				includeSources: {
					tone: ['fn tone(uv: vec2f) -> vec3f {', '\treturn vec3f(uv, 1.0);', '}'].join('\n')
				},
				materialSource: null
			}
		);
		diagnosticsError.stack = '';
		createRendererMock.mockResolvedValue({
			render: vi.fn(() => {
				throw diagnosticsError;
			}),
			destroy: vi.fn()
		} satisfies MockRenderer);

		render(<FragCanvas material={material} />);
		await flushFrame(16);
		await flushFrame(32);

		const overlay = await screen.findByTestId('motiongpu-error');
		expect(overlay.textContent).toContain('#include <tone> (include <tone> line 2)');
		expect(overlay.textContent).not.toContain('#include <tone> (fragment line 2)');
	});

	it('renders diagnostics source header without column and preserves blank snippet lines', async () => {
		const diagnosticsError = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nmissing return'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 31,
						message: 'missing return',
						sourceLocation: { kind: 'fragment', line: 3 }
					}
				],
				fragmentSource: [
					'fn frag(uv: vec2f) -> vec4f {',
					'',
					'\treturn vec4f(uv, 0.0, 1.0);',
					'}'
				].join('\n'),
				includeSources: {},
				materialSource: { component: 'NoColumnScene.svelte' }
			}
		);
		diagnosticsError.stack = '';
		createRendererMock.mockResolvedValue({
			render: vi.fn(() => {
				throw diagnosticsError;
			}),
			destroy: vi.fn()
		} satisfies MockRenderer);

		render(<FragCanvas material={material} />);
		await flushFrame(16);
		await flushFrame(32);

		const overlay = await screen.findByTestId('motiongpu-error');
		expect(overlay.textContent).toContain('NoColumnScene.svelte (fragment line 3)');
		expect(overlay.textContent).not.toContain(', col');
		const snippetLines = Array.from(overlay.querySelectorAll('.motiongpu-error-source-code'));
		expect(snippetLines.some((line) => line.textContent === ' ')).toBe(true);
	});

	it('shows technical details section when source diagnostics are unavailable', async () => {
		const genericError = new Error('top-level failure\ndetail line one');
		genericError.stack = '';
		createRendererMock.mockResolvedValue({
			render: vi.fn(() => {
				throw genericError;
			}),
			destroy: vi.fn()
		} satisfies MockRenderer);

		render(<FragCanvas material={material} />);
		await flushFrame(16);
		await flushFrame(32);

		const overlay = await screen.findByTestId('motiongpu-error');
		expect(overlay.textContent).toContain('Technical details');
		expect(overlay.textContent).toContain('detail line one');
		expect(overlay.textContent).not.toContain('Stack trace');
	});

	it('applies frame uniform/texture writes and clears stale runtime maps after material change', async () => {
		const created: MockRenderer[] = [];
		createRendererMock.mockImplementation(async () => {
			const renderer: MockRenderer = {
				render: vi.fn(),
				destroy: vi.fn()
			};
			created.push(renderer);
			return renderer;
		});

		const view = render(
			<FragCanvasFrameMutationHarness
				material={runtimeBindingsMaterial}
				mode="valid-both"
				showErrorOverlay={false}
			/>
		);

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});
		await flushFrame(32);
		await waitFor(() => {
			expect(created[0]?.render).toHaveBeenCalledTimes(1);
		});
		await flushFrame(40);
		await waitFor(() => {
			expect(created[0]?.render).toHaveBeenCalledTimes(2);
		});

		const firstRenderInput = created[0]?.render.mock.calls[0]?.[0] as
			| { uniforms: Record<string, unknown>; textures: Record<string, unknown> }
			| undefined;
		expect(firstRenderInput?.uniforms['uGain']).toBe(0.75);
		expect(firstRenderInput?.textures['uTex']).toBeTruthy();

		view.rerender(
			<FragCanvasFrameMutationHarness material={material} mode="none" showErrorOverlay={false} />
		);
		await flushFrame(48);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(2);
		});
		await flushFrame(64);
		await waitFor(() => {
			expect(created[1]?.render).toHaveBeenCalledTimes(1);
		});

		const secondRenderInput = created[1]?.render.mock.calls[0]?.[0] as
			| { uniforms: Record<string, unknown>; textures: Record<string, unknown> }
			| undefined;
		expect('uGain' in (secondRenderInput?.uniforms ?? {})).toBe(false);
		expect('uTex' in (secondRenderInput?.textures ?? {})).toBe(false);
	});

	it('reports render-phase error for unknown uniform writes from frame callbacks', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);
		const onError = vi.fn();

		render(
			<FragCanvasFrameMutationHarness
				material={runtimeBindingsMaterial}
				mode="invalid-uniform"
				onError={onError}
				showErrorOverlay={false}
			/>
		);

		await flushFrame(16);
		await flushFrame(32);
		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'render',
					rawMessage: expect.stringContaining('Unknown uniform "uMissing"')
				})
			);
		});
		expect(renderer.render).not.toHaveBeenCalled();
	});

	it('reports render-phase error for unknown texture writes from frame callbacks', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);
		const onError = vi.fn();

		render(
			<FragCanvasFrameMutationHarness
				material={runtimeBindingsMaterial}
				mode="invalid-texture"
				onError={onError}
				showErrorOverlay={false}
			/>
		);

		await flushFrame(16);
		await flushFrame(32);
		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'render',
					rawMessage: expect.stringContaining('Unknown texture "uMissing"')
				})
			);
		});
		expect(renderer.render).not.toHaveBeenCalled();
	});

	it('captures error history with ring-buffer limit', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);
		const onErrorHistory = vi.fn();

		const view = render(
			<FragCanvasFrameMutationHarness
				material={runtimeBindingsMaterial}
				mode="invalid-uniform"
				onErrorHistory={onErrorHistory}
				errorHistoryLimit={2}
				showErrorOverlay={false}
			/>
		);

		await flushFrame(16);
		await flushFrame(32);
		await waitFor(() => {
			const latest = onErrorHistory.mock.calls[onErrorHistory.mock.calls.length - 1]?.[0] as
				| Array<{ rawMessage: string }>
				| undefined;
			expect(latest).toHaveLength(1);
			expect(latest?.[0]?.rawMessage).toContain('Unknown uniform "uMissing"');
		});

		view.rerender(
			<FragCanvasFrameMutationHarness
				material={runtimeBindingsMaterial}
				mode="invalid-texture"
				onErrorHistory={onErrorHistory}
				errorHistoryLimit={2}
				showErrorOverlay={false}
			/>
		);
		await flushFrame(48);
		await waitFor(() => {
			const latest = onErrorHistory.mock.calls[onErrorHistory.mock.calls.length - 1]?.[0] as
				| Array<{ rawMessage: string }>
				| undefined;
			expect(latest).toHaveLength(2);
			expect(latest?.[0]?.rawMessage).toContain('Unknown uniform "uMissing"');
			expect(latest?.[1]?.rawMessage).toContain('Unknown texture "uMissing"');
		});

		view.rerender(
			<FragCanvasFrameMutationHarness
				material={runtimeBindingsMaterial}
				mode="invalid-uniform"
				onErrorHistory={onErrorHistory}
				errorHistoryLimit={2}
				showErrorOverlay={false}
			/>
		);
		await flushFrame(64);
		await waitFor(() => {
			const latest = onErrorHistory.mock.calls[onErrorHistory.mock.calls.length - 1]?.[0] as
				| Array<{ rawMessage: string }>
				| undefined;
			expect(latest).toHaveLength(2);
			expect(latest?.[0]?.rawMessage).toContain('Unknown texture "uMissing"');
			expect(latest?.[1]?.rawMessage).toContain('Unknown uniform "uMissing"');
		});
	});

	it('continues rendering when user-provided onError callback throws', async () => {
		const renderer: MockRenderer = {
			render: vi
				.fn()
				.mockImplementationOnce(() => {
					throw new Error('frame failure');
				})
				.mockImplementation(() => {}),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);
		const onError = vi.fn(() => {
			throw new Error('user onError failure');
		});

		render(<FragCanvas material={material} onError={onError} showErrorOverlay={false} />);

		await flushFrame(16);
		await flushFrame(32);
		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'render',
					rawMessage: 'frame failure'
				})
			);
		});
		await flushFrame(48);
		expect(renderer.render).toHaveBeenCalledTimes(2);
	});

	it('reports initialization error when material becomes invalid during render loop', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);
		const onError = vi.fn();

		const invalidMaterial = {
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: {},
			textures: {},
			defines: {}
		};

		const view = render(
			<FragCanvas material={material} onError={onError} showErrorOverlay={false} />
		);
		await flushFrame(16);
		await flushFrame(32);
		await waitFor(() => {
			expect(renderer.render).toHaveBeenCalledTimes(1);
		});

		view.rerender(
			<FragCanvas
				material={invalidMaterial as unknown as typeof material}
				onError={onError}
				showErrorOverlay={false}
			/>
		);
		await flushFrame(48);
		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: expect.stringContaining('Invalid material instance')
				})
			);
		});
	});

	it('deduplicates repeated initialization errors for unchanged invalid material', async () => {
		const onError = vi.fn();
		const invalidMaterial = {
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: {},
			textures: {},
			defines: {}
		};

		render(
			<FragCanvas
				material={invalidMaterial as unknown as typeof material}
				onError={onError}
				showErrorOverlay={false}
			/>
		);

		await waitFor(() => {
			expect(onError).toHaveBeenCalledTimes(1);
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: expect.stringContaining('Invalid material instance')
				})
			);
		});
		expect(createRendererMock).not.toHaveBeenCalled();

		await flushFrame(16);
		await flushFrame(32);
		await flushFrame(48);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(createRendererMock).not.toHaveBeenCalled();
	});

	it('disposes late-created renderer when component unmounts mid-initialization', async () => {
		let resolveRenderer!: (renderer: MockRenderer) => void;
		createRendererMock.mockImplementation(
			() =>
				new Promise<MockRenderer>((resolve) => {
					resolveRenderer = resolve;
				})
		);

		const lateRenderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		const view = render(<FragCanvas material={material} showErrorOverlay={false} />);

		await flushFrame(16);
		view.unmount();
		resolveRenderer(lateRenderer);
		await Promise.resolve();
		await Promise.resolve();

		expect(lateRenderer.destroy).toHaveBeenCalledTimes(1);
	});

	it('recovers when material becomes valid after initial initialization error', async () => {
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		createRendererMock.mockResolvedValue(renderer);

		const onError = vi.fn();
		const invalidMaterial = {
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			uniforms: {},
			textures: {},
			defines: {}
		};
		const view = render(
			<FragCanvas
				material={invalidMaterial as unknown as typeof material}
				onError={onError}
				showErrorOverlay={false}
			/>
		);

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: expect.stringContaining('Invalid material instance')
				})
			);
		});
		expect(createRendererMock).not.toHaveBeenCalled();

		view.rerender(<FragCanvas material={material} onError={onError} showErrorOverlay={false} />);

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});
		await flushFrame(32);
		await waitFor(() => {
			expect(renderer.render).toHaveBeenCalled();
		});
	});
});
