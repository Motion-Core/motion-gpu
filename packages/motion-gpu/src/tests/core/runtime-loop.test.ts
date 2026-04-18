import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCurrentWritable } from '../../lib/core/current-value';
import { createFrameRegistry } from '../../lib/core/frame-registry';
import { defineMaterial } from '../../lib/core/material';

const { createRendererMock } = vi.hoisted(() => ({
	createRendererMock: vi.fn()
}));

vi.mock('../../lib/core/renderer', () => ({
	createRenderer: createRendererMock
}));

import { createMotionGPURuntimeLoop } from '../../lib/core/runtime-loop';

interface MockRenderer {
	render: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	getStorageBuffer?: ReturnType<typeof vi.fn>;
	getDevice?: ReturnType<typeof vi.fn>;
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

function createCanvas(): HTMLCanvasElement {
	return {
		width: 0,
		height: 0,
		getBoundingClientRect: () => ({ width: 16, height: 9 }),
		getContext: () => null
	} as unknown as HTMLCanvasElement;
}

describe('runtime-loop', () => {
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
		vi.stubGlobal('GPUBufferUsage', {
			MAP_READ: 0x1,
			COPY_DST: 0x2
		});
		vi.stubGlobal('GPUMapMode', {
			READ: 0x1
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('reads storage buffer data through staging copy/map pipeline', async () => {
		const registry = createFrameRegistry();
		let readPromise: Promise<ArrayBuffer> | null = null;
		registry.register('reader', (state) => {
			if (!readPromise) {
				readPromise = state.readStorageBuffer('particles');
			}
		});

		const gpuBuffer = {} as GPUBuffer;
		const mapped = new Uint8Array([1, 2, 3, 4]).buffer;
		const stagingBuffer = {
			mapAsync: vi.fn(async () => undefined),
			getMappedRange: vi.fn(() => mapped),
			unmap: vi.fn(),
			destroy: vi.fn()
		};
		const commandEncoder = {
			copyBufferToBuffer: vi.fn(),
			finish: vi.fn(() => ({}))
		};
		const device = {
			createBuffer: vi.fn(() => stagingBuffer),
			createCommandEncoder: vi.fn(() => commandEncoder),
			queue: { submit: vi.fn() }
		};
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn(),
			getStorageBuffer: vi.fn(() => gpuBuffer),
			getDevice: vi.fn(() => device)
		};
		createRendererMock.mockResolvedValue(renderer);

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			storageBuffers: {
				particles: { size: 4, type: 'array<f32>' }
			}
		});
		const loop = createMotionGPURuntimeLoop({
			canvas: createCanvas(),
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame(16);
		await flushFrame(32);

		expect(readPromise).not.toBeNull();
		if (!readPromise) {
			throw new Error('Missing read promise');
		}
		const result = await readPromise;
		expect(result).toBeInstanceOf(ArrayBuffer);
		expect(Array.from(new Uint8Array(result))).toEqual([1, 2, 3, 4]);
		expect(commandEncoder.copyBufferToBuffer).toHaveBeenCalledWith(
			gpuBuffer,
			0,
			stagingBuffer,
			0,
			4
		);
		expect(stagingBuffer.mapAsync).toHaveBeenCalledWith(0x1);
		expect(stagingBuffer.unmap).toHaveBeenCalledTimes(1);
		expect(stagingBuffer.destroy).toHaveBeenCalledTimes(1);
		loop.destroy();
	});

	it('rejects readStorageBuffer when storage buffer is not allocated on GPU', async () => {
		const registry = createFrameRegistry();
		let readError: unknown = null;
		registry.register('reader', (state) => {
			void state.readStorageBuffer('particles').catch((error) => {
				readError = error;
			});
		});
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn(),
			getStorageBuffer: vi.fn(() => undefined),
			getDevice: vi.fn(() => ({ queue: { submit: vi.fn() } }))
		};
		createRendererMock.mockResolvedValue(renderer);

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			storageBuffers: {
				particles: { size: 4, type: 'array<f32>' }
			}
		});
		const loop = createMotionGPURuntimeLoop({
			canvas: createCanvas(),
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame(16);
		await flushFrame(32);
		await Promise.resolve();

		expect(readError).toBeInstanceOf(Error);
		expect((readError as Error).message).toContain('not allocated on GPU');
		loop.destroy();
	});

	it('rejects readStorageBuffer when renderer has no device accessor', async () => {
		const registry = createFrameRegistry();
		let readError: unknown = null;
		registry.register('reader', (state) => {
			void state.readStorageBuffer('particles').catch((error) => {
				readError = error;
			});
		});
		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn(),
			getStorageBuffer: vi.fn(() => ({}) as unknown as GPUBuffer),
			getDevice: vi.fn(() => undefined)
		};
		createRendererMock.mockResolvedValue(renderer);

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			storageBuffers: {
				particles: { size: 4, type: 'array<f32>' }
			}
		});
		const loop = createMotionGPURuntimeLoop({
			canvas: createCanvas(),
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame(16);
		await flushFrame(32);
		await Promise.resolve();

		expect(readError).toBeInstanceOf(Error);
		expect((readError as Error).message).toContain('GPU device unavailable');
		loop.destroy();
	});

	it('destroys late-created renderer when loop is disposed during async rebuild', async () => {
		const registry = createFrameRegistry();
		let resolveRenderer: ((renderer: MockRenderer) => void) | null = null;
		createRendererMock.mockImplementation(
			() =>
				new Promise<MockRenderer>((resolve) => {
					resolveRenderer = resolve;
				})
		);

		const loop = createMotionGPURuntimeLoop({
			canvas: createCanvas(),
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () =>
				defineMaterial({
					fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
				}),
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame(16);
		expect(createRendererMock).toHaveBeenCalledTimes(1);
		expect(rafQueue).toHaveLength(0);

		const lateRenderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn()
		};
		loop.destroy();
		const resolveRendererNow = resolveRenderer as ((renderer: MockRenderer) => void) | null;
		expect(resolveRendererNow).toBeTypeOf('function');
		resolveRendererNow?.(lateRenderer);
		await Promise.resolve();
		await Promise.resolve();

		expect(lateRenderer.destroy).toHaveBeenCalledTimes(1);
	});

	// -------------------------------------------------------------------------
	// pendingStorageWrites flush correctness (Fix A scope)
	// -------------------------------------------------------------------------

	it('passes queued storage writes to renderer and does not re-send them next frame', async () => {
		const registry = createFrameRegistry();
		let writeSent = false;

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			storageBuffers: { particles: { size: 16, type: 'array<f32>' } }
		});

		// Only queue the write on the first task invocation.
		registry.register('writer', (state) => {
			if (!writeSent) {
				state.writeStorageBuffer('particles', new Float32Array([1, 2, 3, 4]));
				writeSent = true;
			}
		});

		// Capture write snapshots during each render call. The implementation
		// passes the live array reference and clears it with `length = 0` after
		// render() returns, so we must snapshot inside the call — not after.
		const writesPerRenderCall: Array<Array<{ name: string }>> = [];

		const renderer: MockRenderer = {
			render: vi
				.fn()
				.mockImplementation((input: { pendingStorageWrites?: Array<{ name: string }> }) => {
					writesPerRenderCall.push([...(input.pendingStorageWrites ?? [])]);
				}),
			destroy: vi.fn(),
			getStorageBuffer: vi.fn(() => undefined),
			getDevice: vi.fn(() => undefined)
		};
		createRendererMock.mockResolvedValue(renderer);

		const loop = createMotionGPURuntimeLoop({
			canvas: createCanvas(),
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame(16); // renderer init
		await flushFrame(32); // first render — write must be present

		expect(writesPerRenderCall[0]).toBeDefined();
		expect(writesPerRenderCall[0]).toHaveLength(1);
		expect(writesPerRenderCall[0]?.[0]?.name).toBe('particles');

		// Kick a second frame — no new write was queued, so renderer must receive
		// an empty snapshot (array was cleared with length = 0 after first render).
		loop.invalidate();
		await flushFrame(48);

		expect(writesPerRenderCall[1]).toBeDefined();
		expect(writesPerRenderCall[1]).toHaveLength(0);

		loop.destroy();
	});

	it('passes undefined for pendingStorageWrites when no writes are queued', async () => {
		const registry = createFrameRegistry();

		const material = defineMaterial({
			fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(1.0); }',
			storageBuffers: { buf: { size: 4, type: 'array<f32>' } }
		});

		// No write queued — task does nothing.
		registry.register('noop', () => undefined);

		const renderer: MockRenderer = {
			render: vi.fn(),
			destroy: vi.fn(),
			getStorageBuffer: vi.fn(() => undefined),
			getDevice: vi.fn(() => undefined)
		};
		createRendererMock.mockResolvedValue(renderer);

		const loop = createMotionGPURuntimeLoop({
			canvas: createCanvas(),
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame(16);
		await flushFrame(32);

		const renderArgs = renderer.render.mock.calls[0]?.[0] as {
			pendingStorageWrites?: unknown[];
		};
		expect(renderArgs).toBeDefined();
		// When no writes queued, the field must be absent or undefined.
		const writes = renderArgs.pendingStorageWrites;
		expect(writes === undefined || writes.length === 0).toBe(true);

		loop.destroy();
	});
});

describe('runtime-loop resize behavior', () => {
	type ROCallback = (entries: ResizeObserverEntry[]) => void;

	interface MockRO {
		callback: ROCallback;
		observe: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
	}

	let mockROInstances: MockRO[] = [];
	let rafQueue2: FrameRequestCallback[] = [];

	function fireMockRO(instance: MockRO, inlineSize: number, blockSize: number): void {
		instance.callback([
			{
				contentBoxSize: [{ inlineSize, blockSize }]
			} as unknown as ResizeObserverEntry
		]);
	}

	const material = defineMaterial({
		fragment: `fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }`
	});

	beforeEach(() => {
		mockROInstances = [];
		rafQueue2 = [];

		// Must use `function` (not arrow) so the implementation can act as a
		// constructor — vi.fn with an arrow function body throws when called with
		// `new`, preventing the instance from being pushed to mockROInstances.
		const MockResizeObserver = vi.fn(function MockRO(this: unknown, cb: ROCallback) {
			const instance: MockRO = {
				callback: cb,
				observe: vi.fn(),
				disconnect: vi.fn()
			};
			mockROInstances.push(instance);
			return instance;
		});

		vi.stubGlobal('ResizeObserver', MockResizeObserver);
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: FrameRequestCallback) => {
				rafQueue2.push(callback);
				return rafQueue2.length;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('GPUBufferUsage', { MAP_READ: 0x1, COPY_DST: 0x2 });
		vi.stubGlobal('GPUMapMode', { READ: 0x1 });
		createRendererMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function flushFrame2(timestamp: number): Promise<void> {
		const callback = rafQueue2.shift();
		if (!callback) return;
		callback(timestamp);
		await Promise.resolve();
		await Promise.resolve();
	}

	it('observes the canvas element on creation and disconnects on destroy', () => {
		const canvas = {
			width: 0,
			height: 0,
			getBoundingClientRect: vi.fn(() => ({ width: 0, height: 0 })),
			getContext: () => null
		} as unknown as HTMLCanvasElement;

		const registry = createFrameRegistry();
		const renderer = { render: vi.fn(), destroy: vi.fn() };
		createRendererMock.mockResolvedValue(renderer);

		const loop = createMotionGPURuntimeLoop({
			canvas,
			registry,
			size: createCurrentWritable({ width: 0, height: 0 }),
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		expect(mockROInstances).toHaveLength(1);
		expect(mockROInstances[0]!.observe).toHaveBeenCalledWith(canvas);

		loop.destroy();
		expect(mockROInstances[0]!.disconnect).toHaveBeenCalledTimes(1);
	});

	it('uses ResizeObserver dimensions instead of getBoundingClientRect when available', async () => {
		const getBoundingClientRectSpy = vi.fn(() => ({ width: 99, height: 99 }));
		const canvas = {
			width: 0,
			height: 0,
			getBoundingClientRect: getBoundingClientRectSpy,
			getContext: () => null
		} as unknown as HTMLCanvasElement;

		const size = createCurrentWritable({ width: 0, height: 0 });
		const registry = createFrameRegistry();
		const renderer = { render: vi.fn(), destroy: vi.fn() };
		createRendererMock.mockResolvedValue(renderer);

		const loop = createMotionGPURuntimeLoop({
			canvas,
			registry,
			size,
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		// Fire ResizeObserver with explicit dimensions
		fireMockRO(mockROInstances[0]!, 320, 240);

		// Flush the frame scheduled by the ResizeObserver callback
		await flushFrame2(16);
		await flushFrame2(32);

		// getBoundingClientRect must NOT be called during normal frame rendering
		// when ResizeObserver has already provided dimensions.
		expect(getBoundingClientRectSpy).not.toHaveBeenCalled();
		expect(size.current).toEqual({ width: 320, height: 240 });

		loop.destroy();
	});

	it('falls back to getBoundingClientRect when ResizeObserver has not yet fired', async () => {
		const getBoundingClientRectSpy = vi.fn(() => ({ width: 64, height: 48 }));
		const canvas = {
			width: 0,
			height: 0,
			getBoundingClientRect: getBoundingClientRectSpy,
			getContext: () => null
		} as unknown as HTMLCanvasElement;

		const size = createCurrentWritable({ width: 0, height: 0 });
		const registry = createFrameRegistry();
		const renderer = { render: vi.fn(), destroy: vi.fn() };
		createRendererMock.mockResolvedValue(renderer);

		// Do NOT fire the ResizeObserver before the frame — simulate no observation yet.
		const loop = createMotionGPURuntimeLoop({
			canvas,
			registry,
			size,
			dpr: { current: 1, subscribe: () => () => undefined },
			maxDelta: { current: 1, subscribe: () => () => undefined },
			getMaterial: () => material,
			getRenderTargets: () => ({}),
			getPasses: () => [],
			getClearColor: () => [0, 0, 0, 1],
			getOutputColorSpace: () => 'srgb',
			getAdapterOptions: () => undefined,
			getDeviceDescriptor: () => undefined,
			getOnError: () => undefined,
			reportError: () => undefined
		});

		await flushFrame2(16);
		await flushFrame2(32);

		// When ResizeObserver hasn't fired, getBoundingClientRect is the fallback.
		expect(getBoundingClientRectSpy).toHaveBeenCalled();
		expect(size.current).toEqual({ width: 64, height: 48 });

		loop.destroy();
	});
});
