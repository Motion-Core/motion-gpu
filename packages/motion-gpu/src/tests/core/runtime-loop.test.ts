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
});
