import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FragCanvas from '../lib/svelte/FragCanvas.svelte';
import { attachShaderCompilationDiagnostics } from '../lib/core/error-diagnostics';
import { defineMaterial } from '../lib/core/material';
import type { MotionGPUContext } from '../lib/svelte/motiongpu-context';
import FragCanvasFrameMutationHarness from './fixtures/FragCanvasFrameMutationHarness.svelte';
import MotionGPUWithControlProbe from './fixtures/MotionGPUWithControlProbe.svelte';

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

describe('FragCanvas runtime', () => {
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

		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});

		await flushFrame(32);
		await waitFor(() => {
			expect(created[0]?.renderer.render).toHaveBeenCalled();
		});

		await view.rerender({
			material,
			outputColorSpace: 'linear',
			showErrorOverlay: false
		});
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
		render(FragCanvas, {
			props: {
				material,
				onError,
				showErrorOverlay: false
			}
		});

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

		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			}
		});

		await flushFrame(16);
		await waitFor(() => {
			expect(createRendererMock).toHaveBeenCalledTimes(1);
		});

		now = 120;
		await view.rerender({
			material: alternateMaterial,
			showErrorOverlay: false
		});
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

		render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			}
		});

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
		render(MotionGPUWithControlProbe, {
			props: {
				onProbe,
				renderMode: 'manual'
			}
		});

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
		render(MotionGPUWithControlProbe, {
			props: {
				onProbe,
				renderMode: 'on-demand'
			}
		});

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
		render(MotionGPUWithControlProbe, {
			props: {
				onProbe,
				renderMode: 'manual'
			}
		});

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

		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			}
		});
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
				materialSource: { component: 'OverlayScene.svelte' }
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

		render(FragCanvas, { props: { material } });
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

		render(FragCanvas, { props: { material } });
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

		render(FragCanvas, { props: { material } });
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

		render(FragCanvas, { props: { material } });
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

		const view = render(FragCanvasFrameMutationHarness, {
			props: {
				material: runtimeBindingsMaterial,
				mode: 'valid-both',
				showErrorOverlay: false
			}
		});

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

		await view.rerender({
			material,
			mode: 'none',
			showErrorOverlay: false
		});
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

		render(FragCanvasFrameMutationHarness, {
			props: {
				material: runtimeBindingsMaterial,
				mode: 'invalid-uniform',
				onError,
				showErrorOverlay: false
			}
		});

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

		render(FragCanvasFrameMutationHarness, {
			props: {
				material: runtimeBindingsMaterial,
				mode: 'invalid-texture',
				onError,
				showErrorOverlay: false
			}
		});

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

		const view = render(FragCanvas, {
			props: {
				material,
				onError,
				showErrorOverlay: false
			}
		});
		await flushFrame(16);
		await flushFrame(32);
		await waitFor(() => {
			expect(renderer.render).toHaveBeenCalledTimes(1);
		});

		await view.rerender({
			material: invalidMaterial as unknown as typeof material,
			onError,
			showErrorOverlay: false
		});
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
		const view = render(FragCanvas, {
			props: {
				material,
				showErrorOverlay: false
			}
		});

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
		const view = render(FragCanvas, {
			props: {
				material: invalidMaterial as unknown as typeof material,
				onError,
				showErrorOverlay: false
			}
		});

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 'initialization',
					rawMessage: expect.stringContaining('Invalid material instance')
				})
			);
		});
		expect(createRendererMock).not.toHaveBeenCalled();

		await view.rerender({
			material,
			onError,
			showErrorOverlay: false
		});

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
