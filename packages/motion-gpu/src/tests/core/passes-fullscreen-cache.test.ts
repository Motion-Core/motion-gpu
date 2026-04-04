/**
 * Tests for FullscreenPass abstract base class behavior.
 *
 * BlitPass is used as the concrete implementation throughout since
 * FullscreenPass is abstract. All cache / resource-lifecycle behavior
 * lives in the base class and is therefore covered here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlitPass } from '../../lib/passes';
import type { RenderPassContext, RenderTarget } from '../../lib/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTarget(key: string, format: GPUTextureFormat = 'rgba8unorm'): RenderTarget {
	return {
		texture: { key } as unknown as GPUTexture,
		view: ({ key: `${key}-view` }) as unknown as GPUTextureView,
		width: 32,
		height: 32,
		format
	};
}

function createFakeDevice() {
	return {
		createSampler: vi.fn(() => ({ type: 'sampler' }) as unknown as GPUSampler),
		createBindGroupLayout: vi.fn(
			() => ({ type: 'bind-group-layout' }) as unknown as GPUBindGroupLayout
		),
		createShaderModule: vi.fn(() => ({ type: 'shader-module' }) as unknown as GPUShaderModule),
		createPipelineLayout: vi.fn(
			() => ({ type: 'pipeline-layout' }) as unknown as GPUPipelineLayout
		),
		createRenderPipeline: vi.fn(() => ({ type: 'pipeline' }) as unknown as GPURenderPipeline),
		createBindGroup: vi.fn(() => ({ type: 'bind-group' }) as unknown as GPUBindGroup)
	} satisfies Partial<GPUDevice>;
}

type FakeDevice = ReturnType<typeof createFakeDevice>;

function createPassContext(overrides?: Partial<RenderPassContext>): RenderPassContext {
	const source = createTarget('source');
	const target = createTarget('target');
	const canvas = createTarget('canvas');

	return {
		clear: false,
		clearColor: [0, 0, 0, 1],
		preserve: true,
		device: createFakeDevice() as unknown as GPUDevice,
		commandEncoder: {
			copyTextureToTexture: vi.fn()
		} as unknown as GPUCommandEncoder,
		source,
		target,
		canvas,
		input: source,
		output: target,
		targets: {},
		time: 0,
		delta: 0.016,
		width: 32,
		height: 32,
		beginRenderPass: vi.fn(
			() =>
				({
					setPipeline: vi.fn(),
					setBindGroup: vi.fn(),
					draw: vi.fn(),
					end: vi.fn()
				}) as unknown as GPURenderPassEncoder
		),
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FullscreenPass resource caching', () => {
	beforeEach(() => {
		vi.stubGlobal('GPUShaderStage', { FRAGMENT: 0x10 });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	// --- Bind group WeakMap caching -----------------------------------------

	it('reuses bind group for the same input view across multiple renders', () => {
		const pass = new BlitPass();
		const context = createPassContext();
		const device = context.device as unknown as FakeDevice;

		pass.render(context);
		pass.render(context);
		pass.render(context);

		// input.view is identical across all three renders – bind group created once.
		expect(device.createBindGroup).toHaveBeenCalledTimes(1);
	});

	it('allocates a new bind group for each distinct input view', () => {
		const pass = new BlitPass();
		const sharedDevice = createFakeDevice() as unknown as GPUDevice;
		const deviceMock = sharedDevice as unknown as FakeDevice;

		const viewA = ({ key: 'view-a' }) as unknown as GPUTextureView;
		const viewB = ({ key: 'view-b' }) as unknown as GPUTextureView;
		const viewC = ({ key: 'view-c' }) as unknown as GPUTextureView;

		const makeCtx = (view: GPUTextureView) =>
			createPassContext({
				device: sharedDevice,
				input: { ...createTarget('src'), view }
			});

		pass.render(makeCtx(viewA));
		pass.render(makeCtx(viewB));
		pass.render(makeCtx(viewC));

		expect(deviceMock.createBindGroup).toHaveBeenCalledTimes(3);

		// Re-rendering known views should NOT allocate additional bind groups.
		pass.render(makeCtx(viewA));
		pass.render(makeCtx(viewB));
		expect(deviceMock.createBindGroup).toHaveBeenCalledTimes(3);
	});

	// --- Pipeline per output format -----------------------------------------

	it('creates a separate pipeline for each distinct output format', () => {
		const pass = new BlitPass();
		const sharedDevice = createFakeDevice() as unknown as GPUDevice;
		const deviceMock = sharedDevice as unknown as FakeDevice;

		const ctxRgba8 = createPassContext({
			device: sharedDevice,
			output: createTarget('out-rgba8', 'rgba8unorm')
		});
		const ctxRgba16 = createPassContext({
			device: sharedDevice,
			output: createTarget('out-rgba16', 'rgba16float')
		});

		pass.render(ctxRgba8);
		pass.render(ctxRgba16);

		// Two formats → two pipelines.
		expect(deviceMock.createRenderPipeline).toHaveBeenCalledTimes(2);

		// Second render for each format → still two (cached).
		pass.render(ctxRgba8);
		pass.render(ctxRgba16);
		expect(deviceMock.createRenderPipeline).toHaveBeenCalledTimes(2);
	});

	// --- Sampler creation with filter options --------------------------------

	it('creates sampler with linear filter by default', () => {
		const pass = new BlitPass();
		const context = createPassContext();
		const device = context.device as unknown as FakeDevice;

		pass.render(context);

		expect(device.createSampler).toHaveBeenCalledWith(
			expect.objectContaining({ magFilter: 'linear', minFilter: 'linear' })
		);
	});

	it('creates sampler with nearest filter when filter option is "nearest"', () => {
		const pass = new BlitPass({ filter: 'nearest' });
		const context = createPassContext();
		const device = context.device as unknown as FakeDevice;

		pass.render(context);

		expect(device.createSampler).toHaveBeenCalledWith(
			expect.objectContaining({ magFilter: 'nearest', minFilter: 'nearest' })
		);
	});

	// --- Sampler / bindGroupLayout / shaderModule reuse ----------------------

	it('reuses sampler, bindGroupLayout, and shaderModule within the same device', () => {
		const pass = new BlitPass();
		const context = createPassContext();
		const device = context.device as unknown as FakeDevice;

		for (let i = 0; i < 5; i++) {
			pass.render(context);
		}

		expect(device.createSampler).toHaveBeenCalledTimes(1);
		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(1);
		expect(device.createShaderModule).toHaveBeenCalledTimes(1);
	});

	// --- Device switch invalidates all caches --------------------------------

	it('resets sampler, bindGroupLayout and shader module when device changes', () => {
		const pass = new BlitPass();
		const ctx1 = createPassContext();
		const ctx2 = createPassContext(); // fresh device object
		const dev1 = ctx1.device as unknown as FakeDevice;
		const dev2 = ctx2.device as unknown as FakeDevice;

		pass.render(ctx1);
		pass.render(ctx2);

		expect(dev1.createSampler).toHaveBeenCalledTimes(1);
		expect(dev2.createSampler).toHaveBeenCalledTimes(1);

		expect(dev1.createBindGroupLayout).toHaveBeenCalledTimes(1);
		expect(dev2.createBindGroupLayout).toHaveBeenCalledTimes(1);

		expect(dev1.createShaderModule).toHaveBeenCalledTimes(1);
		expect(dev2.createShaderModule).toHaveBeenCalledTimes(1);
	});

	// --- dispose() resets all state -----------------------------------------

	it('re-creates all GPU resources after dispose()', () => {
		const pass = new BlitPass();
		const context = createPassContext();
		const device = context.device as unknown as FakeDevice;

		pass.render(context);
		expect(device.createSampler).toHaveBeenCalledTimes(1);
		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(1);
		expect(device.createShaderModule).toHaveBeenCalledTimes(1);
		expect(device.createRenderPipeline).toHaveBeenCalledTimes(1);
		expect(device.createBindGroup).toHaveBeenCalledTimes(1);

		pass.dispose();

		// After dispose, all caches are cleared – re-render must allocate fresh.
		pass.render(context);
		expect(device.createSampler).toHaveBeenCalledTimes(2);
		expect(device.createBindGroupLayout).toHaveBeenCalledTimes(2);
		expect(device.createShaderModule).toHaveBeenCalledTimes(2);
		expect(device.createRenderPipeline).toHaveBeenCalledTimes(2);
		expect(device.createBindGroup).toHaveBeenCalledTimes(2);
	});

	it('dispose() followed by multiple renders allocates resources only once per new resource', () => {
		const pass = new BlitPass();
		const context = createPassContext();
		const device = context.device as unknown as FakeDevice;

		pass.render(context);
		pass.dispose();

		// Three renders after dispose – sampler/layout/module/pipeline created once,
		// bind group created once (same view object).
		pass.render(context);
		pass.render(context);
		pass.render(context);

		expect(device.createSampler).toHaveBeenCalledTimes(2); // 1 before + 1 after dispose
		expect(device.createBindGroup).toHaveBeenCalledTimes(2); // 1 before + 1 after dispose
	});
});
