import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlitPass, CopyPass, ShaderPass } from '../../lib/passes';
import type { RenderPassContext, RenderTarget } from '../../lib/core/types';

function createTarget(key: string): RenderTarget {
	return {
		texture: { key } as unknown as GPUTexture,
		view: { key: `${key}-view` } as unknown as GPUTextureView,
		width: 32,
		height: 32,
		format: 'rgba8unorm'
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

describe('built-in passes', () => {
	beforeEach(() => {
		vi.stubGlobal('GPUShaderStage', { FRAGMENT: 0x10 });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('configures default BlitPass flow', () => {
		const pass = new BlitPass();
		expect(pass.enabled).toBe(true);
		expect(pass.needsSwap).toBe(true);
		expect(pass.input).toBe('source');
		expect(pass.output).toBe('target');
		expect(pass.clear).toBe(false);
		expect(pass.preserve).toBe(true);
	});

	it('configures default CopyPass flow', () => {
		const pass = new CopyPass();
		expect(pass.enabled).toBe(true);
		expect(pass.needsSwap).toBe(true);
		expect(pass.input).toBe('source');
		expect(pass.output).toBe('target');
		expect(pass.clear).toBe(false);
		expect(pass.preserve).toBe(true);
	});

	it('supports named input/output slots for non-swap passes', () => {
		const blit = new BlitPass({ needsSwap: false, input: 'fxMain', output: 'fxBloom' });
		expect(blit.input).toBe('fxMain');
		expect(blit.output).toBe('fxBloom');

		const copy = new CopyPass({ needsSwap: false, input: 'fxBloom', output: 'fxFinal' });
		expect(copy.input).toBe('fxBloom');
		expect(copy.output).toBe('fxFinal');

		const shader = new ShaderPass({
			needsSwap: false,
			input: 'fxFinal',
			output: 'canvas',
			fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv, 1.0), inputColor.a);
}
`
		});
		expect(shader.input).toBe('fxFinal');
		expect(shader.output).toBe('canvas');
	});

	it('validates ShaderPass fragment contract', () => {
		expect(
			() =>
				new ShaderPass({
					fragment: 'fn broken() -> vec4f { return vec4f(1.0); }'
				})
		).toThrow(/fn shade\(inputColor: vec4f, uv: vec2f\) -> vec4f/);

		const pass = new ShaderPass({
			fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv, 1.0), inputColor.a);
}
`
		});
		expect(pass.getFragment()).toContain('fn shade(inputColor: vec4f, uv: vec2f)');
	});

	it('uses direct GPU copy path when CopyPass surfaces are compatible', () => {
		const pass = new CopyPass();
		const context = createPassContext();
		const fallbackRender = vi.spyOn(
			(pass as unknown as { fallbackBlit: BlitPass }).fallbackBlit,
			'render'
		);

		pass.render(context);

		expect(context.commandEncoder.copyTextureToTexture).toHaveBeenCalledTimes(1);
		expect(fallbackRender).not.toHaveBeenCalled();
	});

	it('falls back to blit when CopyPass cannot use direct copy', () => {
		const pass = new CopyPass();
		const context = createPassContext({ clear: true });
		const fallbackRender = vi.spyOn(
			(pass as unknown as { fallbackBlit: BlitPass }).fallbackBlit,
			'render'
		);

		pass.render(context);

		expect(context.commandEncoder.copyTextureToTexture).not.toHaveBeenCalled();
		expect(fallbackRender).toHaveBeenCalledTimes(1);
	});

	it('disposes internal blit pass when CopyPass is disposed', () => {
		const pass = new CopyPass();
		const disposeSpy = vi.spyOn(
			(pass as unknown as { fallbackBlit: BlitPass }).fallbackBlit,
			'dispose'
		);
		pass.dispose();
		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it('reuses ShaderPass pipeline cache and invalidates it after setFragment', () => {
		const pass = new ShaderPass({
			fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv, 1.0), inputColor.a);
}
`
		});
		const context = createPassContext();
		const device = context.device as unknown as ReturnType<typeof createFakeDevice>;

		pass.render(context);
		pass.render(context);
		expect(device.createRenderPipeline).toHaveBeenCalledTimes(1);

		pass.setFragment(`
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rg, uv.x, inputColor.a);
}
`);
		pass.render(context);
		expect(device.createRenderPipeline).toHaveBeenCalledTimes(2);
	});

	it('reuses BlitPass pipeline cache and resets it for a different device', () => {
		const pass = new BlitPass();
		const firstContext = createPassContext();
		const secondContext = createPassContext();
		const firstDevice = firstContext.device as unknown as ReturnType<typeof createFakeDevice>;
		const secondDevice = secondContext.device as unknown as ReturnType<typeof createFakeDevice>;

		pass.render(firstContext);
		pass.render(firstContext);
		pass.render(secondContext);

		expect(firstDevice.createRenderPipeline).toHaveBeenCalledTimes(1);
		expect(secondDevice.createRenderPipeline).toHaveBeenCalledTimes(1);
	});

	it('resets ShaderPass GPU caches when rendering with a different device', () => {
		const pass = new ShaderPass({
			fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb, inputColor.a);
}
`
		});
		const firstContext = createPassContext();
		const secondContext = createPassContext();
		const firstDevice = firstContext.device as unknown as ReturnType<typeof createFakeDevice>;
		const secondDevice = secondContext.device as unknown as ReturnType<typeof createFakeDevice>;

		pass.render(firstContext);
		pass.render(secondContext);

		expect(firstDevice.createRenderPipeline).toHaveBeenCalledTimes(1);
		expect(secondDevice.createRenderPipeline).toHaveBeenCalledTimes(1);
	});

	it('forwards CopyPass setSize to fallback blit implementation', () => {
		const pass = new CopyPass();
		const setSizeSpy = vi.spyOn(
			(pass as unknown as { fallbackBlit: BlitPass }).fallbackBlit,
			'setSize'
		);

		pass.setSize(320, 240);

		expect(setSizeSpy).toHaveBeenCalledWith(320, 240);
	});

	it('supports setSize/dispose smoke flow for BlitPass and ShaderPass', () => {
		const blit = new BlitPass();
		const shader = new ShaderPass({
			fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv, 1.0), inputColor.a);
}
`
		});
		const passEncoders: Array<{
			setPipeline: ReturnType<typeof vi.fn>;
			setBindGroup: ReturnType<typeof vi.fn>;
			draw: ReturnType<typeof vi.fn>;
			end: ReturnType<typeof vi.fn>;
		}> = [];
		const context = createPassContext({
			beginRenderPass: vi.fn(() => {
				const encoder = {
					setPipeline: vi.fn(),
					setBindGroup: vi.fn(),
					draw: vi.fn(),
					end: vi.fn()
				};
				passEncoders.push(encoder);
				return encoder as unknown as GPURenderPassEncoder;
			})
		});

		expect(() => blit.setSize(1920, 1080)).not.toThrow();
		expect(() => shader.setSize(1920, 1080)).not.toThrow();

		blit.render(context);
		shader.render(context);

		blit.dispose();
		shader.dispose();

		expect(() => blit.render(context)).not.toThrow();
		expect(() => shader.render(context)).not.toThrow();

		expect(passEncoders).toHaveLength(4);
		for (const encoder of passEncoders) {
			expect(encoder.setPipeline).toHaveBeenCalledTimes(1);
			expect(encoder.setBindGroup).toHaveBeenCalledTimes(1);
			expect(encoder.draw).toHaveBeenCalledWith(3);
			expect(encoder.end).toHaveBeenCalledTimes(1);
		}
	});
});
