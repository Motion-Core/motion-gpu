import { defineMaterial, resolveMaterial } from '../../../src/lib/core/material';
import { createRenderer } from '../../../src/lib/core/renderer';
import type { AnyPass, Renderer } from '../../../src/lib/core/types';
import { ComputePass } from '../../../src/lib/passes/ComputePass';
import { ShaderPass } from '../../../src/lib/passes/ShaderPass';
import { summarizeSamples } from '../real-renderer-results';

export interface Stats {
	samples: number[];
	median: number;
	p95: number;
	p99: number;
	min: number;
	max: number;
	coefficientOfVariationPct: number;
}

export interface CorrectnessSink {
	before: number;
	after: number;
	pixelCount: number;
	rgbRangeBefore: number;
	rgbRangeAfter: number;
	computeSentinelBefore: number | null;
	computeSentinelAfter: number | null;
}

export interface ScenarioResult {
	name: string;
	passCount: number;
	cpuSubmitMs: Stats;
	queueCompletionMs: Stats;
	gpuFrameNs: Stats;
	correctness: CorrectnessSink;
}

export interface RealRendererBrowserResult {
	adapter: {
		vendor: string;
		architecture: string;
		device: string;
		description: string;
		backend: string;
		type: string;
		driver: string;
		isFallbackAdapter: boolean;
	};
	features: string[];
	config: {
		width: number;
		height: number;
		crossOriginIsolated: true;
		performanceNowResolutionMs: number;
		warmupFrames: number;
		sampleFrames: number;
		cpuSampleBatches: number;
		cpuFramesPerBatch: number;
		cpuInterval: 'amortized-renderer.render-call';
		gpuInterval: 'pre-marker-end-to-post-marker-begin';
		completionInterval: 'before-render-to-onSubmittedWorkDone';
	};
	scenarios: ScenarioResult[];
}

const WIDTH = 512;
const HEIGHT = 512;
const WARMUP_FRAMES = 16;
const SAMPLE_FRAMES = 100;
const CPU_SAMPLE_BATCHES = 30;
const CPU_FRAMES_PER_BATCH = 25;

function measurePerformanceNowResolution(): number {
	let previous = performance.now();
	let minimum = Number.POSITIVE_INFINITY;
	for (let sample = 0; sample < 100; sample += 1) {
		let current = performance.now();
		while (current === previous) {
			current = performance.now();
		}
		minimum = Math.min(minimum, current - previous);
		previous = current;
	}
	return minimum;
}

async function readComputeSentinel(renderer: Renderer, device: GPUDevice): Promise<number | null> {
	const storage = renderer.getStorageBuffer?.('data');
	if (!storage) {
		return null;
	}
	const readback = device.createBuffer({
		size: 4,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	try {
		const encoder = device.createCommandEncoder();
		encoder.copyBufferToBuffer(storage, 0, readback, 0, 4);
		device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ);
		const value = new Float32Array(readback.getMappedRange())[0] ?? Number.NaN;
		readback.unmap();
		return value;
	} finally {
		readback.destroy();
	}
}

function installCanvasReadback(canvas: HTMLCanvasElement): {
	checksum: (device: GPUDevice) => Promise<{ checksum: number; rgbRange: number }>;
} {
	const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
	if (!context) {
		throw new Error('Canvas does not support WebGPU readback instrumentation');
	}
	let currentTexture: GPUTexture | null = null;
	const configure = context.configure.bind(context);
	const getCurrentTexture = context.getCurrentTexture.bind(context);
	context.configure = (configuration) => {
		configure({
			...configuration,
			usage: (configuration.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC
		});
	};
	context.getCurrentTexture = () => {
		currentTexture = getCurrentTexture();
		return currentTexture;
	};

	return {
		checksum: async (device) => {
			if (!currentTexture) {
				throw new Error('Renderer did not acquire a canvas texture');
			}
			const bytesPerRow = WIDTH * 4;
			const buffer = device.createBuffer({
				size: bytesPerRow * HEIGHT,
				usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
			});
			try {
				const encoder = device.createCommandEncoder();
				encoder.copyTextureToBuffer(
					{ texture: currentTexture },
					{ buffer, bytesPerRow, rowsPerImage: HEIGHT },
					{ width: WIDTH, height: HEIGHT, depthOrArrayLayers: 1 }
				);
				device.queue.submit([encoder.finish()]);
				await buffer.mapAsync(GPUMapMode.READ);
				const pixels = new Uint8Array(buffer.getMappedRange());
				let checksum = 2_166_136_261;
				let opaquePixels = 0;
				let rgbMin = 255;
				let rgbMax = 0;
				for (let index = 0; index < pixels.length; index += 4) {
					for (let channel = 0; channel < 4; channel += 1) {
						const value = pixels[index + channel] ?? 0;
						checksum ^= value;
						checksum = Math.imul(checksum, 16_777_619) >>> 0;
						if (channel < 3) {
							rgbMin = Math.min(rgbMin, value);
							rgbMax = Math.max(rgbMax, value);
						}
					}
					if ((pixels[index + 3] ?? 0) > 0) {
						opaquePixels += 1;
					}
				}
				buffer.unmap();
				const rgbRange = rgbMax - rgbMin;
				if (opaquePixels !== WIDTH * HEIGHT || checksum === 0 || rgbRange < 16) {
					throw new Error(
						`Renderer correctness sink failed (opaquePixels=${opaquePixels}, checksum=${checksum}, rgbRange=${rgbRange})`
					);
				}
				return { checksum, rgbRange };
			} finally {
				buffer.destroy();
			}
		}
	};
}

function createPasses(kind: 'no-pass' | 'sixteen-pass' | 'compute'): AnyPass[] {
	if (kind === 'sixteen-pass') {
		return Array.from(
			{ length: 16 },
			() =>
				new ShaderPass({
					fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * 0.999 + vec3f(uv, 0.5) * 0.001, inputColor.a);
}
`
				})
		);
	}
	if (kind === 'compute') {
		return [
			new ComputePass({
				compute: `
@compute @workgroup_size(64)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	if (id.x < 16384u) {
		data[id.x] = data[id.x] + vec4f(0.000001, 0.0, 0.0, 0.0);
	}
}
`,
				resources: { data: { buffer: 'data', access: 'storage-read-write' } },
				dispatch: [256, 1, 1]
			})
		];
	}
	return [];
}

async function createScenarioRenderer(
	name: 'no-pass' | 'sixteen-pass' | 'compute',
	canvas: HTMLCanvasElement
): Promise<{ renderer: Renderer; passes: AnyPass[] }> {
	const withCompute = name === 'compute';
	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(0.15 + uv.x * 0.7, 0.2 + uv.y * 0.6, 0.45, 1.0);
}
`,
		...(withCompute
			? {
					storageBuffers: {
						data: {
							size: 262144,
							type: 'array<vec4f>' as const,
							initialData: new Float32Array(65536)
						}
					}
				}
			: {})
	});
	const resolved = resolveMaterial(material);
	const passes = createPasses(name);
	const renderer = await createRenderer({
		canvas,
		fragmentWgsl: resolved.fragmentWgsl,
		fragmentLineMap: resolved.fragmentLineMap,
		fragmentSource: resolved.fragmentSource,
		includeSources: resolved.includeSources,
		defineBlockSource: resolved.defineBlockSource,
		materialSource: resolved.source,
		materialSignature: resolved.signature,
		uniformLayout: resolved.uniformLayout,
		textureKeys: resolved.textureKeys,
		textureDefinitions: resolved.textures,
		storageBufferKeys: resolved.storageBufferKeys,
		storageBufferDefinitions: material.storageBuffers,
		storageTextureKeys: resolved.storageTextureKeys,
		passes,
		getClearColor: () => [0, 0, 0, 1],
		getDpr: () => 1,
		adapterOptions: { powerPreference: 'high-performance' },
		deviceDescriptor: { requiredFeatures: ['timestamp-query'] }
	});
	return { renderer, passes };
}

function createTimestampMarker(device: GPUDevice): {
	mark: (index: 0 | 1, resolveResults: boolean) => GPUCommandBuffer;
	read: () => Promise<number>;
	destroy: () => void;
} {
	const querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
	const resolveBuffer = device.createBuffer({
		size: 16,
		usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
	});
	const readBuffer = device.createBuffer({
		size: 16,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	const texture = device.createTexture({
		size: [1, 1, 1],
		format: 'rgba8unorm',
		usage: GPUTextureUsage.RENDER_ATTACHMENT
	});
	const view = texture.createView();
	return {
		mark: (index, resolveResults) => {
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view,
						loadOp: 'clear',
						storeOp: 'store',
						clearValue: { r: 0, g: 0, b: 0, a: 1 }
					}
				],
				timestampWrites:
					index === 0
						? { querySet, endOfPassWriteIndex: index }
						: { querySet, beginningOfPassWriteIndex: index }
			});
			pass.end();
			if (resolveResults) {
				encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
				encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 16);
			}
			return encoder.finish();
		},
		read: async () => {
			await readBuffer.mapAsync(GPUMapMode.READ);
			const values = new BigUint64Array(readBuffer.getMappedRange().slice(0));
			const elapsed = Number((values[1] ?? 0n) - (values[0] ?? 0n));
			readBuffer.unmap();
			return elapsed;
		},
		destroy: () => {
			querySet.destroy();
			resolveBuffer.destroy();
			readBuffer.destroy();
			texture.destroy();
		}
	};
}

async function runScenario(name: 'no-pass' | 'sixteen-pass' | 'compute'): Promise<ScenarioResult> {
	const canvas = document.createElement('canvas');
	canvas.width = WIDTH;
	canvas.height = HEIGHT;
	document.body.replaceChildren(canvas);
	const readback = installCanvasReadback(canvas);
	const scenario = await createScenarioRenderer(name, canvas);
	const { renderer, passes } = scenario;
	const device = renderer.getDevice?.();
	if (!device) {
		renderer.destroy();
		throw new Error('Renderer did not expose its active GPUDevice');
	}
	const marker = createTimestampMarker(device);
	const render = (): void => {
		renderer.render({
			time: 1,
			delta: 1 / 60,
			renderMode: 'manual',
			uniforms: {},
			textures: {},
			canvasSize: { width: WIDTH, height: HEIGHT }
		});
	};
	try {
		for (let index = 0; index < WARMUP_FRAMES; index += 1) {
			render();
			await device.queue.onSubmittedWorkDone();
		}
		render();
		const before = await readback.checksum(device);
		const computeSentinelBefore = await readComputeSentinel(renderer, device);
		const cpuSubmitSamples: number[] = [];
		for (let sample = 0; sample < CPU_SAMPLE_BATCHES; sample += 1) {
			const startedAt = performance.now();
			for (let frame = 0; frame < CPU_FRAMES_PER_BATCH; frame += 1) {
				render();
			}
			cpuSubmitSamples.push((performance.now() - startedAt) / CPU_FRAMES_PER_BATCH);
			await device.queue.onSubmittedWorkDone();
		}
		const queueCompletionSamples: number[] = [];
		const gpuFrameSamples: number[] = [];
		for (let index = 0; index < SAMPLE_FRAMES; index += 1) {
			device.queue.submit([marker.mark(0, false)]);
			const startedAt = performance.now();
			render();
			const rendererCompletion = device.queue.onSubmittedWorkDone();
			device.queue.submit([marker.mark(1, true)]);
			await rendererCompletion;
			queueCompletionSamples.push(performance.now() - startedAt);
			gpuFrameSamples.push(await marker.read());
		}
		render();
		const after = await readback.checksum(device);
		const computeSentinelAfter = await readComputeSentinel(renderer, device);
		if (before.checksum !== after.checksum || before.rgbRange !== after.rgbRange) {
			throw new Error(
				`Renderer correctness output changed: before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`
			);
		}
		if (
			computeSentinelBefore !== null &&
			(computeSentinelAfter === null || computeSentinelAfter <= computeSentinelBefore)
		) {
			throw new Error(
				`Compute correctness sentinel did not advance: before=${computeSentinelBefore}, after=${String(computeSentinelAfter)}`
			);
		}
		return {
			name,
			passCount: passes.length,
			cpuSubmitMs: summarizeSamples(cpuSubmitSamples),
			queueCompletionMs: summarizeSamples(queueCompletionSamples),
			gpuFrameNs: summarizeSamples(gpuFrameSamples),
			correctness: {
				before: before.checksum,
				after: after.checksum,
				pixelCount: WIDTH * HEIGHT,
				rgbRangeBefore: before.rgbRange,
				rgbRangeAfter: after.rgbRange,
				computeSentinelBefore,
				computeSentinelAfter
			}
		};
	} finally {
		marker.destroy();
		renderer.destroy();
	}
}

async function run(): Promise<RealRendererBrowserResult> {
	if (!crossOriginIsolated) {
		throw new Error('Cross-origin isolation is required for high-resolution CPU submit timing');
	}
	const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
	if (!adapter) {
		throw new Error('Unable to acquire a WebGPU adapter');
	}
	const info = adapter.info as GPUAdapterInfo & {
		backend?: string;
		type?: string;
		driver?: string;
	};
	const softwareIdentity = [
		info.vendor,
		info.architecture,
		info.device,
		info.description,
		info.backend,
		info.type,
		info.driver
	]
		.join(' ')
		.toLowerCase();
	const isSoftware = /swiftshader|llvmpipe|software|(?:^|[^a-z])(?:cpu|null)(?:[^a-z]|$)/u.test(
		softwareIdentity
	);
	const isFallbackAdapter = info.isFallbackAdapter ?? false;
	if (isFallbackAdapter || isSoftware) {
		throw new Error(`Physical GPU required; received ${softwareIdentity}`);
	}
	if (!adapter.features.has('timestamp-query')) {
		throw new Error('Physical GPU adapter does not support timestamp-query');
	}

	return {
		adapter: {
			vendor: info.vendor ?? '',
			architecture: info.architecture ?? '',
			device: info.device ?? '',
			description: info.description ?? '',
			backend: info.backend ?? '',
			type: info.type ?? '',
			driver: info.driver ?? '',
			isFallbackAdapter
		},
		features: [...adapter.features].sort(),
		config: {
			width: WIDTH,
			height: HEIGHT,
			crossOriginIsolated: true,
			performanceNowResolutionMs: measurePerformanceNowResolution(),
			warmupFrames: WARMUP_FRAMES,
			sampleFrames: SAMPLE_FRAMES,
			cpuSampleBatches: CPU_SAMPLE_BATCHES,
			cpuFramesPerBatch: CPU_FRAMES_PER_BATCH,
			cpuInterval: 'amortized-renderer.render-call',
			gpuInterval: 'pre-marker-end-to-post-marker-begin',
			completionInterval: 'before-render-to-onSubmittedWorkDone'
		},
		scenarios: [
			await runScenario('no-pass'),
			await runScenario('sixteen-pass'),
			await runScenario('compute')
		]
	};
}

declare global {
	interface Window {
		__SPEKTRAL_REAL_RENDERER_BENCHMARK__?: () => Promise<RealRendererBrowserResult>;
	}
}

window.__SPEKTRAL_REAL_RENDERER_BENCHMARK__ = run;
