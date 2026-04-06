/**
 * Edge-case tests for createMotionGPURuntimeLoop that are not covered by
 * the main runtime-loop.test.ts suite.
 *
 * Covered here:
 *  - writeStorageBuffer validation (unknown name, negative offset, out-of-bounds)
 *  - setUniform / setTexture unknown-name validation
 *  - Error deduplication (same error suppressed until frame clears)
 *  - Error recovery: clear is delayed until a short stability window passes
 *  - User onError handler that throws does not crash the loop
 *  - User onErrorHistory handler that throws does not crash the loop
 *  - Error history accumulates and respects the configured limit
 *  - Delta is clamped to options.maxDelta.current before being passed to tasks
 *  - Renderer creation failure triggers setError and schedules retry
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCurrentWritable } from '../../lib/core/current-value';
import { createFrameRegistry } from '../../lib/core/frame-registry';
import { defineMaterial } from '../../lib/core/material';

// ---------------------------------------------------------------------------
// Module mock – must be hoisted before the import of runtime-loop
// ---------------------------------------------------------------------------

const { createRendererMock } = vi.hoisted(() => ({
	createRendererMock: vi.fn()
}));

vi.mock('../../lib/core/renderer', () => ({
	createRenderer: createRendererMock
}));

import type { FragMaterial } from '../../lib/core/material';
import { createMotionGPURuntimeLoop } from '../../lib/core/runtime-loop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MockRenderer {
	render: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	getStorageBuffer?: ReturnType<typeof vi.fn>;
	getDevice?: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// RAF queue helpers
// ---------------------------------------------------------------------------

let rafQueue: FrameRequestCallback[] = [];

async function flushFrame(timestamp: number): Promise<void> {
	const callback = rafQueue.shift();
	if (!callback) {
		throw new Error('No queued animation frame callback');
	}
	callback(timestamp);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve(); // extra tick for nested async resolution
}

// ---------------------------------------------------------------------------
// Canvas / renderer factory helpers
// ---------------------------------------------------------------------------

function createCanvas(): HTMLCanvasElement {
	return {
		width: 0,
		height: 0,
		getBoundingClientRect: () => ({ width: 16, height: 9 }),
		getContext: () => null
	} as unknown as HTMLCanvasElement;
}

function createRenderer(): MockRenderer {
	return {
		render: vi.fn(),
		destroy: vi.fn(),
		getStorageBuffer: vi.fn(() => undefined),
		getDevice: vi.fn(() => undefined)
	};
}

// ---------------------------------------------------------------------------
// Base loop options factory
// ---------------------------------------------------------------------------

function baseOptions(
	registry: ReturnType<typeof createFrameRegistry>,
	material = defineMaterial({
		fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
	}),
	extras: Partial<Parameters<typeof createMotionGPURuntimeLoop>[0]> = {}
): Parameters<typeof createMotionGPURuntimeLoop>[0] {
	return {
		canvas: createCanvas(),
		registry,
		size: createCurrentWritable({ width: 0, height: 0 }),
		dpr: { current: 1, subscribe: () => () => undefined },
		maxDelta: { current: 0.1, subscribe: () => () => undefined },
		getMaterial: () => material,
		getRenderTargets: () => ({}),
		getPasses: () => [],
		getClearColor: () => [0, 0, 0, 1],
		getOutputColorSpace: () => 'srgb',
		getAdapterOptions: () => undefined,
		getDeviceDescriptor: () => undefined,
		getOnError: () => undefined,
		reportError: () => undefined,
		...extras
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runtime-loop edge cases', () => {
	beforeEach(() => {
		rafQueue = [];
		createRendererMock.mockReset();
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: FrameRequestCallback) => {
				rafQueue.push(callback);
				return rafQueue.length;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('GPUBufferUsage', { MAP_READ: 0x1, COPY_DST: 0x2 });
		vi.stubGlobal('GPUMapMode', { READ: 0x1 });
		vi.stubGlobal('performance', { now: vi.fn(() => 0) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// writeStorageBuffer validation
	// -------------------------------------------------------------------------

	it('reports render error when writeStorageBuffer receives unknown buffer name', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		// Material has NO storage buffers → any name is unknown.
		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		registry.register('bad-write', (state) => {
			state.writeStorageBuffer('nonexistent', new Uint8Array(4));
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16); // renderer initialises
		await flushFrame(32); // task runs → throws → reportError

		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	it('reports render error when writeStorageBuffer offset is negative', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			storageBuffers: { particles: { size: 16, type: 'array<f32>' } }
		});

		registry.register('bad-offset', (state) => {
			state.writeStorageBuffer('particles', new Uint8Array(4), { offset: -1 });
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16);
		await flushFrame(32);

		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	it('reports render error when writeStorageBuffer write exceeds buffer size', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			storageBuffers: { buf: { size: 8, type: 'array<u32>' } }
		});

		// offset=6, byteLength=4 → 6+4=10 > 8 → out of bounds
		registry.register('oob-write', (state) => {
			state.writeStorageBuffer('buf', new Uint8Array(4), { offset: 6 });
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16);
		await flushFrame(32);

		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// setUniform / setTexture validation
	// -------------------------------------------------------------------------

	it('reports render error when setUniform receives an unknown uniform name', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		// Material has no uniforms → any name is unknown.
		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		registry.register('bad-uniform', (state) => {
			state.setUniform('noSuchUniform', 1.0);
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16);
		await flushFrame(32);

		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	it('reports render error when setTexture receives an unknown texture name', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		// Material has no textures → any name is unknown.
		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		registry.register('bad-texture', (state) => {
			state.setTexture(
				'noSuchTexture',
				null as unknown as import('../../lib/core/types').TextureValue
			);
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16);
		await flushFrame(32);

		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// Error deduplication
	// -------------------------------------------------------------------------

	it('does not call reportError twice for the same error within consecutive frames', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		registry.register('repeated-error', (state) => {
			state.setUniform('ghost', 1.0); // always fails with same message
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16); // renderer init
		await flushFrame(32); // error frame 1 → reportError called (1st time)
		// After an error frame shouldContinueAfterFrame=false so loop stops.
		// Manually kick the loop to execute additional frames.
		loop.invalidate();
		await flushFrame(48); // same error frame 2 → deduplicated, no new call
		loop.invalidate();
		await flushFrame(64); // same error frame 3 → still deduplicated

		const errorCalls = reportError.mock.calls.filter((args) => args[0] !== null);
		expect(errorCalls).toHaveLength(1);

		loop.destroy();
	});

	it('clears errors only after a stability window and then re-reports on regression', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		let shouldFail = true;
		registry.register('toggling-error', (state) => {
			if (shouldFail) {
				state.setUniform('ghost', 1.0);
			}
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16); // renderer init
		await flushFrame(32); // error frame → reportError(report) [1]
		// Error frame stops the loop – kick manually for the first success frame.
		loop.invalidate();
		shouldFail = false;
		await flushFrame(48); // success frame, still inside grace window => no clear yet
		// Success frame auto-schedules next (always mode), no manual kick needed.
		await flushFrame(900); // clear should happen once the grace window elapsed
		shouldFail = true;
		await flushFrame(916); // error again → reportError(report) [3]

		const calls = reportError.mock.calls;
		expect(calls[0]?.[0]).toMatchObject({ phase: 'render' }); // first error
		expect(calls[1]?.[0]).toBeNull(); // cleared after stability window
		expect(calls[2]?.[0]).toMatchObject({ phase: 'render' }); // re-reported

		loop.destroy();
	});

	it('keeps error latched across short healthy gaps when the same error reappears', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		let shouldFail = true;
		registry.register('intermittent-same-error', (state) => {
			if (shouldFail) {
				state.setUniform('ghost', 1.0);
			}
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16); // renderer init
		await flushFrame(32); // error reported [1]
		loop.invalidate();
		shouldFail = false;
		await flushFrame(48); // success, no clear yet
		loop.invalidate();
		shouldFail = true;
		await flushFrame(64); // same error deduped, no re-report, grace window refreshed
		loop.invalidate();
		shouldFail = false;
		await flushFrame(80); // success, still no clear due to refreshed window
		await flushFrame(1000); // stable success past grace window => clear [2]

		const calls = reportError.mock.calls;
		const nonNullCalls = calls.filter((args) => args[0] !== null);
		const nullCalls = calls.filter((args) => args[0] === null);

		expect(nonNullCalls).toHaveLength(1);
		expect(nullCalls).toHaveLength(1);

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// User error handler safety
	// -------------------------------------------------------------------------

	it('swallows exceptions thrown by the user onError handler', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		// The user's error handler throws – the loop must survive.
		const getOnError = vi.fn(() => {
			return () => {
				throw new Error('user error handler explodes');
			};
		});

		registry.register('bad-uniform-2', (state) => {
			state.setUniform('ghost', 1.0);
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, material, { reportError, getOnError })
		);

		// Should not throw despite handler throwing.
		await expect(flushFrame(16)).resolves.toBeUndefined();
		await expect(flushFrame(32)).resolves.toBeUndefined();

		// Verify the error was detected (handler was invoked) and its throw swallowed.
		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	it('swallows exceptions thrown by the user onErrorHistory handler', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		const getOnErrorHistory = vi.fn(() => {
			return () => {
				throw new Error('history handler explodes');
			};
		});

		registry.register('bad-uniform-3', (state) => {
			state.setUniform('ghost', 1.0);
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, material, {
				reportError,
				getErrorHistoryLimit: () => 5,
				getOnErrorHistory
			})
		);

		await expect(flushFrame(16)).resolves.toBeUndefined();
		await expect(flushFrame(32)).resolves.toBeUndefined();

		// Verify error was detected (history callback was invoked) and its throw swallowed.
		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'render' }));

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// Error history
	// -------------------------------------------------------------------------

	it('accumulates distinct errors in history up to the configured limit', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();
		const reportErrorHistory = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		// Each frame we throw a distinct error by calling writeStorageBuffer with
		// a different (also unknown) key so deduplication doesn't collapse them.
		let errorIndex = 0;
		registry.register('rotating-errors', (state) => {
			// Calling with keys 'buf0', 'buf1', 'buf2' – all unknown → distinct errors
			state.writeStorageBuffer(`buf${errorIndex++}`, new Uint8Array(4));
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, material, {
				reportError,
				reportErrorHistory,
				getErrorHistoryLimit: () => 2
			})
		);

		// Each call uses a different buffer key → different error message → different
		// deduplication key → each frame IS reported despite the active error key.

		await flushFrame(16); // init renderer
		await flushFrame(32); // error 0 (buf0) → history=[report0]
		// Error frames stop the loop – kick manually for each subsequent frame.
		loop.invalidate();
		await flushFrame(48); // error 1 (buf1) → history=[report0, report1]
		loop.invalidate();
		await flushFrame(64); // error 2 (buf2) → trimmed to [report1, report2]
		loop.invalidate();
		await flushFrame(80); // error 3 (buf3) → trimmed to [report2, report3]

		// The last reportErrorHistory call should reflect a 2-entry window.
		const lastHistoryArg =
			reportErrorHistory.mock.calls[reportErrorHistory.mock.calls.length - 1]?.[0];
		expect(Array.isArray(lastHistoryArg)).toBe(true);
		expect(lastHistoryArg).toHaveLength(2);

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// Delta clamping
	// -------------------------------------------------------------------------

	it('clamps the delta passed to tasks using maxDelta.current', async () => {
		const registry = createFrameRegistry();
		const observedDeltas: number[] = [];

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		registry.register('observe-delta', (state) => {
			observedDeltas.push(state.delta);
		});

		createRendererMock.mockResolvedValue(createRenderer());

		// maxDelta = 0.05 seconds
		const maxDeltaReadable = { current: 0.05, subscribe: () => () => undefined };

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, material, { maxDelta: maxDeltaReadable })
		);

		// performance.now() is stubbed to 0, so previousTime starts at 0.
		// timestamp=16 → time=0.016s, rawDelta=0.016 → under limit → delta=0.016
		await flushFrame(16); // renderer init (no registry.run yet)
		// timestamp=2000 → time=2.0s, rawDelta ≈ 2.0 → clamped to 0.05
		await flushFrame(2000);

		// The registry itself also clamps with its own maxDelta (default 0.1),
		// min(0.05, 0.1) = 0.05, so the task sees 0.05.
		expect(observedDeltas).toHaveLength(1);
		expect(observedDeltas[0]).toBeCloseTo(0.05, 6);

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// Error history: correct trim direction and no spread allocation (Fix B scope)
	// -------------------------------------------------------------------------

	it('retains the LAST N errors when history exceeds the limit (trim from front)', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();
		const reportErrorHistory = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		// Each frame throws a distinct error by using a different unknown buffer name.
		// This bypasses deduplication so every frame adds a new entry to history.
		let errorIndex = 0;
		registry.register('rotating-errors-trim', (state) => {
			state.writeStorageBuffer(`slot${errorIndex++}`, new Uint8Array(4));
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, material, {
				reportError,
				reportErrorHistory,
				getErrorHistoryLimit: () => 3
			})
		);

		await flushFrame(16); // renderer init
		// Errors 0, 1, 2, 3, 4 — history limit=3, so after 5 errors only [2,3,4] remain.
		await flushFrame(32); // error slot0 → history=[slot0]
		loop.invalidate();
		await flushFrame(48); // error slot1 → history=[slot0, slot1]
		loop.invalidate();
		await flushFrame(64); // error slot2 → history=[slot0, slot1, slot2]
		loop.invalidate();
		await flushFrame(80); // error slot3 → trimmed → history=[slot1, slot2, slot3]
		loop.invalidate();
		await flushFrame(96); // error slot4 → trimmed → history=[slot2, slot3, slot4]

		const lastHistory: unknown[] =
			reportErrorHistory.mock.calls[reportErrorHistory.mock.calls.length - 1]?.[0];
		expect(Array.isArray(lastHistory)).toBe(true);
		expect(lastHistory).toHaveLength(3);

		// The LAST 3 errors must be slot2, slot3, slot4 — NOT slot0, slot1.
		const messages = lastHistory.map((r) => (r as { message: string }).message);
		expect(messages.some((m) => m.includes('slot2'))).toBe(true);
		expect(messages.some((m) => m.includes('slot3'))).toBe(true);
		expect(messages.some((m) => m.includes('slot4'))).toBe(true);
		expect(messages.some((m) => m.includes('slot0'))).toBe(false);
		expect(messages.some((m) => m.includes('slot1'))).toBe(false);

		loop.destroy();
	});

	it('reduces history to the new limit when getErrorHistoryLimit shrinks mid-run', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();
		const reportErrorHistory = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		let errorIndex = 0;
		let historyLimit = 5;

		registry.register('rotating-errors-shrink', (state) => {
			state.writeStorageBuffer(`entry${errorIndex++}`, new Uint8Array(4));
		});

		createRendererMock.mockResolvedValue(createRenderer());

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, material, {
				reportError,
				reportErrorHistory,
				getErrorHistoryLimit: () => historyLimit
			})
		);

		await flushFrame(16);
		// Build up 4 distinct history entries.
		for (let i = 0; i < 4; i++) {
			loop.invalidate();
			await flushFrame(32 + i * 16);
		}

		// Shrink limit to 2 — syncErrorHistory should trim on next frame.
		historyLimit = 2;
		loop.invalidate();
		await flushFrame(200); // success frame — triggers syncErrorHistory with new limit

		const lastHistory: unknown[] =
			reportErrorHistory.mock.calls[reportErrorHistory.mock.calls.length - 1]?.[0];
		expect(Array.isArray(lastHistory)).toBe(true);
		expect(lastHistory.length).toBeLessThanOrEqual(2);

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// Material hot-swap: stale key cleanup (Fix C scope)
	// -------------------------------------------------------------------------

	it('removes stale uniform keys from runtime maps after material signature change', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		// First material declares uniform "speed".
		const materialA = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			uniforms: { speed: { type: 'f32', value: 0 } }
		});

		// Second material drops "speed" and declares "brightness" instead.
		const materialB = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			uniforms: { brightness: { type: 'f32', value: 1 } }
		});

		let currentMaterial: FragMaterial = materialA;

		// Track what uniforms the renderer received per frame.
		const renderedUniformSnapshots: string[][] = [];
		const mockRenderer = createRenderer();
		mockRenderer.render.mockImplementation((input: { uniforms: Record<string, unknown> }) => {
			renderedUniformSnapshots.push(Object.keys(input.uniforms));
		});
		createRendererMock.mockResolvedValue(mockRenderer);

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, materialA, {
				getMaterial: () => currentMaterial,
				reportError
			})
		);

		// Frame 1: renderer initialises with materialA.
		await flushFrame(16);
		// Frame 2: first render with materialA — "speed" should be present.
		await flushFrame(32);

		// Swap to materialB — different signature forces renderer rebuild.
		currentMaterial = materialB;

		// Frame 3: new renderer spins up for materialB.
		await flushFrame(48);
		// Frame 4: first render with materialB — "speed" must be absent, "brightness" present.
		await flushFrame(64);

		// Renderer rebuilt → two separate createRenderer calls.
		expect(createRendererMock).toHaveBeenCalledTimes(2);

		// After swap: renderer receives "brightness", NOT "speed".
		const lastSnapshot = renderedUniformSnapshots[renderedUniformSnapshots.length - 1];
		expect(lastSnapshot).toBeDefined();
		expect(lastSnapshot).toContain('brightness');
		expect(lastSnapshot).not.toContain('speed');

		loop.destroy();
	});

	it('removes stale texture keys from runtime maps after material signature change', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const materialA = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			textures: { background: {} }
		});

		const materialB = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			textures: { overlay: {} }
		});

		let currentMaterial: FragMaterial = materialA;

		const renderedTextureSnapshots: string[][] = [];
		const mockRenderer = createRenderer();
		mockRenderer.render.mockImplementation((input: { textures: Record<string, unknown> }) => {
			renderedTextureSnapshots.push(Object.keys(input.textures));
		});
		createRendererMock.mockResolvedValue(mockRenderer);

		const loop = createMotionGPURuntimeLoop(
			baseOptions(registry, materialA, {
				getMaterial: () => currentMaterial,
				reportError
			})
		);

		await flushFrame(16);
		await flushFrame(32); // materialA render — "background" present

		currentMaterial = materialB;

		await flushFrame(48);
		await flushFrame(64); // materialB render — "overlay" present, "background" absent

		const lastSnapshot = renderedTextureSnapshots[renderedTextureSnapshots.length - 1];
		expect(lastSnapshot).toBeDefined();
		expect(lastSnapshot).toContain('overlay');
		expect(lastSnapshot).not.toContain('background');

		loop.destroy();
	});

	// -------------------------------------------------------------------------
	// Renderer creation failure
	// -------------------------------------------------------------------------

	it('reports initialization error when renderer creation rejects', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		createRendererMock.mockRejectedValue(new Error('adapter not found'));

		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16); // kicks off renderer creation (fails)
		await flushFrame(32); // next scheduled frame after failure

		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'initialization' }));

		loop.destroy();
	});

	it('does not attempt renderer rebuild while within the retry backoff window', async () => {
		const registry = createFrameRegistry();
		const reportError = vi.fn();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }'
		});

		createRendererMock.mockRejectedValue(new Error('gpu init failed'));

		// performance.now() starts at 0; nextRendererRetryAt will be set to 250ms.
		// We keep performance.now() at 0, so subsequent frames are always within
		// the backoff window and createRenderer should NOT be called again.
		const loop = createMotionGPURuntimeLoop(baseOptions(registry, material, { reportError }));

		await flushFrame(16); // triggers first createRenderer attempt (fails)
		// At this point createRendererMock called once.

		// Flush several more frames; performance.now() stays at 0, still within
		// the 250ms backoff window → createRenderer must NOT be called again.
		await flushFrame(32);
		await flushFrame(48);
		await flushFrame(64);

		expect(createRendererMock).toHaveBeenCalledTimes(1);

		loop.destroy();
	});
});
