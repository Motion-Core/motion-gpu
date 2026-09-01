import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { defineMaterial, resolveMaterial } from '../../src/lib/core/material';
import { planRenderGraph } from '../../src/lib/core/render-graph';
import { resolveRenderTargetDefinitions } from '../../src/lib/core/render-targets';
import {
	packUniformsInto,
	packUniformsIntoFast,
	resolveUniformLayout
} from '../../src/lib/core/uniforms';
import { findDirtyFloatRanges } from '../../src/lib/core/renderer';
import { createFrameRegistry } from '../../src/lib/core/frame-registry';
import { createComputeBindGroupCache } from '../../src/lib/core/compute-bindgroup-cache';
import {
	copyComputeResourceMap,
	normalizeComputeResourceMap,
	resolveComputePassResources,
	type ComputeResourceResolverContext,
	type ComputeResourceResolverLimits
} from '../../src/lib/core/compute-resources';
import type {
	RuntimeStorageBufferResource,
	RuntimeTextureResource
} from '../../src/lib/core/resource-registry';
import type {
	ComputeResourceDescriptor,
	ComputeResourceMap,
	FrameState,
	RenderPass,
	UniformValue
} from '../../src/lib/core/types';
import {
	BENCHMARK_SCHEMA_VERSION,
	collectBenchmarkEnvironment,
	compareBenchmarkEnvironments,
	type BenchmarkEnvironment
} from './benchmark-schema';
import { compareBenchmarkMetrics } from './benchmark-regression';
import { computeRobustStats, type RobustStats } from './statistics';

const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const BASELINE_PATH = resolve(PACKAGE_ROOT, 'benchmarks/baselines/core.json');
const LATEST_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/core-latest.json');
const DEFAULT_PROCESS_COUNT = 10;
const DEFAULT_SAMPLE_COUNT = 24;
const DEFAULT_WARMUP_MS = 400;
const WORKER_TIMEOUT_MS = 5 * 60_000;

const METRIC_RULES = {
	resolve_material_cached_hz: { direction: 'higher', maxRegressionPct: 15 },
	resolve_material_uncached_hz: { direction: 'higher', maxRegressionPct: 15 },
	resolve_material_uncached_64_vec4_hz: { direction: 'higher', maxRegressionPct: 15 },
	pack_uniforms_into_64_vec4_hz: { direction: 'higher', maxRegressionPct: 15 },
	pack_uniforms_into_fast_64_vec4_hz: { direction: 'higher', maxRegressionPct: 15 },
	pack_uniforms_mat4_float32array_hz: { direction: 'higher', maxRegressionPct: 15 },
	find_dirty_ranges_clean_frame_hz: { direction: 'higher', maxRegressionPct: 15 },
	find_dirty_ranges_one_vec4_hz: { direction: 'higher', maxRegressionPct: 15 },
	find_dirty_ranges_32_fragmented_vec4_hz: { direction: 'higher', maxRegressionPct: 15 },
	renderer_uniform_update_64_vec4_one_dirty_hz: {
		direction: 'higher',
		maxRegressionPct: 15
	},
	plan_render_graph_16_passes_hz: { direction: 'higher', maxRegressionPct: 15 },
	resolve_render_targets_8_hz: { direction: 'higher', maxRegressionPct: 15 },
	frame_registry_run_64_tasks_hz: { direction: 'higher', maxRegressionPct: 15 },
	frame_registry_run_64_tasks_profiled_hz: { direction: 'higher', maxRegressionPct: 18 },
	compute_bindgroup_cache_hit_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_copy_1_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_copy_4_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_copy_16_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_static_0_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_static_1_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_static_4_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_static_16_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_external_1_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_external_4_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_resolve_external_16_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_copy_resolve_1_pass_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_copy_resolve_8_passes_hz: { direction: 'higher', maxRegressionPct: 15 },
	compute_resources_copy_resolve_32_passes_hz: { direction: 'higher', maxRegressionPct: 15 }
} as const;

type MetricKey = keyof typeof METRIC_RULES;
type MetricMap = Record<MetricKey, number>;

interface ProcessBenchmarkStats extends RobustStats {
	checksum: number;
}

interface CoreBenchmarkDocument {
	schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
	generatedAt: string;
	environment: BenchmarkEnvironment;
	config: {
		processCount: number;
		sampleCount: number;
		warmupMs: number;
		seed: number;
		caseOrder: 'seeded-per-process';
	};
	metrics: MetricMap;
	stats: Record<
		MetricKey,
		{
			processMediansHz: number[];
			distribution: RobustStats;
			processes: ProcessBenchmarkStats[];
		}
	>;
}

interface CoreBaselineDocument {
	schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
	updatedAt: string;
	environment: BenchmarkEnvironment;
	config: CoreBenchmarkDocument['config'];
	metrics: Partial<MetricMap>;
}

interface BenchmarkCase {
	name: MetricKey;
	batchSize: number;
	fn: () => void;
	checksum?: () => number;
}

interface BenchmarkArgs {
	updateBaseline: boolean;
	strict: boolean;
	worker: boolean;
	processCount: number;
	sampleCount: number;
	warmupMs: number;
	seed: number;
}

function numericArg(argv: string[], name: string, fallback: number): number {
	const prefix = `--${name}=`;
	const raw = argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
	if (raw === undefined) {
		return fallback;
	}
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`--${name} must be a positive integer, received ${raw}`);
	}
	return value;
}

function parseArgs(argv: string[]): BenchmarkArgs {
	const flags = new Set(argv);
	return {
		updateBaseline: flags.has('--update-baseline'),
		strict: flags.has('--strict'),
		worker: flags.has('--worker'),
		processCount: numericArg(argv, 'processes', DEFAULT_PROCESS_COUNT),
		sampleCount: numericArg(argv, 'samples', DEFAULT_SAMPLE_COUNT),
		warmupMs: numericArg(argv, 'warmup-ms', DEFAULT_WARMUP_MS),
		seed: numericArg(argv, 'seed', Date.now() & 0x7fff_ffff)
	};
}

function createRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

function shuffleCases(cases: BenchmarkCase[], seed: number): BenchmarkCase[] {
	const random = createRandom(seed);
	const shuffled = [...cases];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
	}
	return shuffled;
}

function runCase(
	target: BenchmarkCase,
	config: Pick<BenchmarkArgs, 'sampleCount' | 'warmupMs'>
): ProcessBenchmarkStats {
	const warmupUntil = performance.now() + config.warmupMs;
	while (performance.now() < warmupUntil) {
		target.fn();
	}

	const samples: number[] = [];
	for (let sampleIndex = 0; sampleIndex < config.sampleCount; sampleIndex += 1) {
		const startedAt = performance.now();
		for (let index = 0; index < target.batchSize; index += 1) {
			target.fn();
		}
		const elapsedSec = Math.max(0.000001, (performance.now() - startedAt) / 1000);
		samples.push(target.batchSize / elapsedSec);
	}

	return { ...computeRobustStats(samples), checksum: target.checksum?.() ?? 1 };
}

async function maybeReadBaseline(): Promise<CoreBaselineDocument | null> {
	try {
		const raw = await readFile(BASELINE_PATH, 'utf8');
		return JSON.parse(raw) as CoreBaselineDocument;
	} catch (error) {
		const candidate = error as NodeJS.ErrnoException;
		if (candidate.code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function formatNumber(value: number): string {
	return value.toFixed(2);
}

function createComputeResourceBenchmarkCases(): BenchmarkCase[] {
	const limits: ComputeResourceResolverLimits = {
		maxBindingsPerBindGroup: 32,
		maxSampledTexturesPerShaderStage: 16,
		maxSamplersPerShaderStage: 16,
		maxStorageTexturesPerShaderStage: 8,
		maxStorageBuffersPerShaderStage: 8,
		maxStorageBufferBindingSize: 1 << 20
	};
	const view = {} as GPUTextureView;
	const textures = new Map<string, RuntimeTextureResource>();
	const buffers = new Map<string, RuntimeStorageBufferResource>();
	for (let index = 0; index < 8; index += 1) {
		const texture = {
			format: 'rgba8unorm',
			usage: 12,
			dimension: '2d',
			sampleCount: 1,
			depthOrArrayLayers: 1,
			mipLevelCount: 1,
			createView: () => view
		} as unknown as GPUTexture;
		textures.set(`texture${index}`, {
			logicalId: `texture${index}`,
			ownedTexture: texture,
			storageView: view,
			sampledView: view,
			publishedView: view,
			format: 'rgba8unorm',
			width: 64,
			height: 64,
			mipLevelCount: 1,
			sampleType: 'float',
			usage: 12 as GPUTextureUsageFlags,
			resourceVersion: 0
		});
		buffers.set(`buffer${index}`, {
			logicalId: `buffer${index}`,
			buffer: { size: 4096, usage: 128 } as GPUBuffer,
			size: 4096,
			wgslType: 'array<vec4f>',
			access: 'read-write',
			usage: 128 as GPUBufferUsageFlags,
			resourceVersion: 0
		});
	}

	const context: ComputeResourceResolverContext = {
		passLabel: 'Core benchmark compute pass',
		deviceFeatures: new Set(),
		limits,
		externalContext: {
			device: {} as GPUDevice,
			width: 1920,
			height: 1080,
			time: 1,
			delta: 1 / 60
		},
		getMaterialTexture: (logicalId) => textures.get(logicalId),
		getMaterialStorageBuffer: (logicalId) => buffers.get(logicalId),
		getMaterialSampler: () => undefined,
		createTextureView: () => view
	};

	const resourceMap = (count: 0 | 1 | 4 | 16): ComputeResourceMap => {
		const resources: Record<string, ComputeResourceDescriptor> = {};
		for (let index = 0; index < Math.min(count, 8); index += 1) {
			resources[`buffer${index}`] = {
				buffer: `buffer${index}`,
				access: 'storage-read'
			};
		}
		for (let index = 8; index < count; index += 1) {
			resources[`texture${index - 8}`] = {
				texture: `texture${index - 8}`,
				access: 'sampled'
			};
		}
		return normalizeComputeResourceMap(resources);
	};
	const externalResourceMap = (count: 1 | 4 | 16): ComputeResourceMap => {
		const resources: Record<string, ComputeResourceDescriptor> = {};
		for (let index = 0; index < Math.min(count, 8); index += 1) {
			const buffer = buffers.get(`buffer${index}`)?.buffer;
			if (!buffer) {
				throw new Error(`Missing benchmark buffer ${index}`);
			}
			resources[`buffer${index}`] = {
				buffer: {
					externalBuffer: () => buffer,
					resourceId: `external-buffer-${index}`,
					wgslType: 'array<vec4f>',
					size: 4096,
					usage: 128
				},
				access: 'storage-read'
			};
		}
		for (let index = 8; index < count; index += 1) {
			const texture = textures.get(`texture${index - 8}`)?.ownedTexture;
			if (!texture) {
				throw new Error(`Missing benchmark texture ${index - 8}`);
			}
			resources[`texture${index - 8}`] = {
				texture: {
					externalTexture: () => texture,
					resourceId: `external-texture-${index - 8}`,
					format: 'rgba8unorm',
					usage: 12
				},
				access: 'sampled'
			};
		}
		return normalizeComputeResourceMap(resources);
	};

	const staticMaps = {
		0: resourceMap(0),
		1: resourceMap(1),
		4: resourceMap(4),
		16: resourceMap(16)
	};
	const externalMaps = {
		1: externalResourceMap(1),
		4: externalResourceMap(4),
		16: externalResourceMap(16)
	};

	const copyCase = (count: 1 | 4 | 16, batchSize: number): BenchmarkCase => {
		let bindingCount = 0;
		return {
			name: `compute_resources_copy_${count}_hz`,
			batchSize,
			fn: () => {
				bindingCount = Object.keys(copyComputeResourceMap(staticMaps[count])).length;
			},
			checksum: () => bindingCount
		};
	};
	const staticResolveCase = (count: 0 | 1 | 4 | 16, batchSize: number): BenchmarkCase => {
		let bindingCount = -1;
		return {
			name: `compute_resources_resolve_static_${count}_hz`,
			batchSize,
			fn: () => {
				bindingCount = resolveComputePassResources(staticMaps[count], context).bindingCount;
			},
			checksum: () => bindingCount
		};
	};
	const externalResolveCase = (count: 1 | 4 | 16, batchSize: number): BenchmarkCase => {
		let bindingCount = -1;
		return {
			name: `compute_resources_resolve_external_${count}_hz`,
			batchSize,
			fn: () => {
				bindingCount = resolveComputePassResources(externalMaps[count], context).bindingCount;
			},
			checksum: () => bindingCount
		};
	};
	const passScalingCase = (passCount: 1 | 8 | 32, batchSize: number): BenchmarkCase => {
		let bindingCount = -1;
		const metricByPassCount = {
			1: 'compute_resources_copy_resolve_1_pass_hz',
			8: 'compute_resources_copy_resolve_8_passes_hz',
			32: 'compute_resources_copy_resolve_32_passes_hz'
		} as const;
		return {
			name: metricByPassCount[passCount],
			batchSize,
			fn: () => {
				bindingCount = 0;
				for (let index = 0; index < passCount; index += 1) {
					bindingCount += resolveComputePassResources(
						copyComputeResourceMap(staticMaps[4]),
						context
					).bindingCount;
				}
			},
			checksum: () => bindingCount
		};
	};

	return [
		copyCase(1, 20_000),
		copyCase(4, 10_000),
		copyCase(16, 3_000),
		staticResolveCase(0, 20_000),
		staticResolveCase(1, 10_000),
		staticResolveCase(4, 4_000),
		staticResolveCase(16, 1_000),
		externalResolveCase(1, 8_000),
		externalResolveCase(4, 3_000),
		externalResolveCase(16, 750),
		passScalingCase(1, 4_000),
		passScalingCase(8, 500),
		passScalingCase(32, 125)
	];
}

function createCases(): BenchmarkCase[] {
	const staticFragment = `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`;

	const cachedMaterial = defineMaterial({
		fragment: staticFragment,
		uniforms: {
			time: 0,
			amplitude: [1, 0.5, 0.25, 1] as [number, number, number, number]
		}
	});
	resolveMaterial(cachedMaterial);

	const uncachedMaterialInput = {
		fragment: staticFragment,
		uniforms: {
			time: 0,
			amplitude: [1, 0.5, 0.25, 1] as [number, number, number, number]
		}
	};
	const largeUniformMap: Record<string, UniformValue> = {};
	for (let index = 0; index < 64; index += 1) {
		largeUniformMap[`u${index}`] = [index, index + 1, index + 2, index + 3] as [
			number,
			number,
			number,
			number
		];
	}
	const uncachedLargeMaterialInput = {
		fragment: staticFragment,
		uniforms: largeUniformMap
	};

	const uniformMap: Record<string, UniformValue> = {};
	for (let index = 0; index < 64; index += 1) {
		uniformMap[`u${index}`] = [index, index + 1, index + 2, index + 3] as [
			number,
			number,
			number,
			number
		];
	}
	const uniformLayout = resolveUniformLayout(uniformMap);
	const uniformOut = new Float32Array(uniformLayout.byteLength / 4);
	let uniformTick = 0;

	const passes: RenderPass[] = Array.from({ length: 16 }, (_, index) => ({
		enabled: true,
		needsSwap: false,
		input: index === 0 ? 'source' : (`fx${index - 1}` as string),
		output: index === 15 ? 'canvas' : (`fx${index}` as string),
		clear: false,
		preserve: true,
		render: () => {}
	}));
	const passTargets = Array.from({ length: 15 }, (_, index) => `fx${index}`);

	const renderTargetMap: Record<string, { scale: number }> = {};
	for (let index = 0; index < 8; index += 1) {
		renderTargetMap[`rt${index}`] = { scale: 1 };
	}

	const registry = createFrameRegistry({
		renderMode: 'always',
		autoRender: true,
		maxDelta: 0.1,
		profilingEnabled: false
	});
	for (let index = 0; index < 64; index += 1) {
		registry.register(`task-${index}`, () => {}, { autoInvalidate: false });
	}
	const profiledRegistry = createFrameRegistry({
		renderMode: 'always',
		autoRender: true,
		maxDelta: 0.1,
		profilingEnabled: true,
		profilingWindow: 120
	});
	for (let index = 0; index < 64; index += 1) {
		profiledRegistry.register(`profiled-task-${index}`, () => {}, { autoInvalidate: false });
	}
	const frameState: FrameState = {
		time: 0,
		delta: 1 / 60,
		setUniform: () => {},
		setTexture: () => {},
		writeStorageBuffer: () => {},
		readStorageBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		invalidate: () => {},
		advance: () => {},
		renderMode: 'always',
		autoRender: true,
		canvas: {} as HTMLCanvasElement
	};

	const bindGroupResource = {} as GPUBuffer;
	const bindGroupLayout = {} as GPUBindGroupLayout;
	const bindGroupRequest = {
		topologyKey: 'data:read-write',
		layout: bindGroupLayout,
		entries: [{ binding: 0, resource: { buffer: bindGroupResource } }],
		resourceRefs: [bindGroupResource]
	};
	const bindGroupCache = createComputeBindGroupCache({
		createBindGroup: () => ({}) as GPUBindGroup
	} as unknown as GPUDevice);
	bindGroupCache.getOrCreate(bindGroupRequest);

	return [
		{
			name: 'resolve_material_cached_hz',
			batchSize: 10_000,
			fn: () => {
				resolveMaterial(cachedMaterial);
			}
		},
		{
			name: 'resolve_material_uncached_hz',
			batchSize: 1_500,
			fn: () => {
				const material = defineMaterial(uncachedMaterialInput);
				resolveMaterial(material);
			}
		},
		{
			name: 'resolve_material_uncached_64_vec4_hz',
			batchSize: 300,
			fn: () => {
				const material = defineMaterial(uncachedLargeMaterialInput);
				resolveMaterial(material);
			}
		},
		{
			name: 'pack_uniforms_into_64_vec4_hz',
			batchSize: 8_000,
			fn: () => {
				uniformTick += 1;
				uniformMap['u0'] = [uniformTick, 1, 2, 3] as [number, number, number, number];
				packUniformsInto(uniformMap, uniformLayout, uniformOut);
			}
		},
		{
			// Fast unchecked path — mirrors the renderer hot path (values pre-validated at setUniform time)
			name: 'pack_uniforms_into_fast_64_vec4_hz',
			batchSize: 8_000,
			fn: (() => {
				const fastMap: Record<string, UniformValue> = {};
				for (let index = 0; index < 64; index += 1) {
					fastMap[`u${index}`] = [index, index + 1, index + 2, index + 3] as [
						number,
						number,
						number,
						number
					];
				}
				const fastLayout = resolveUniformLayout(fastMap);
				const fastOut = new Float32Array(fastLayout.byteLength / 4);
				let fastTick = 0;
				return () => {
					fastTick += 1;
					fastMap['u0'] = [fastTick, 1, 2, 3] as [number, number, number, number];
					packUniformsIntoFast(fastMap, fastLayout, fastOut);
				};
			})()
		},
		{
			name: 'plan_render_graph_16_passes_hz',
			batchSize: 10_000,
			fn: () => {
				planRenderGraph(passes, [0, 0, 0, 1], passTargets);
			}
		},
		{
			name: 'resolve_render_targets_8_hz',
			batchSize: 10_000,
			fn: () => {
				resolveRenderTargetDefinitions(renderTargetMap, 1920, 1080, 'rgba8unorm');
			}
		},
		{
			name: 'frame_registry_run_64_tasks_hz',
			batchSize: 5_000,
			fn: () => {
				frameState.time += frameState.delta;
				registry.run(frameState);
				registry.endFrame();
			}
		},
		{
			name: 'frame_registry_run_64_tasks_profiled_hz',
			batchSize: 500,
			fn: () => {
				frameState.time += frameState.delta;
				profiledRegistry.run(frameState);
				profiledRegistry.endFrame();
			}
		},
		{
			name: 'compute_bindgroup_cache_hit_hz',
			batchSize: 100_000,
			fn: () => {
				bindGroupCache.getOrCreate(bindGroupRequest);
			}
		},
		{
			// mat4x4f packing via Float32Array — hot path for camera/transform uniforms
			name: 'pack_uniforms_mat4_float32array_hz',
			batchSize: 50_000,
			fn: (() => {
				const mat4Map: Record<string, UniformValue> = {
					uMatrix: { type: 'mat4x4f' as const, value: new Float32Array(16) }
				};
				const mat4Layout = resolveUniformLayout(mat4Map);
				const mat4Out = new Float32Array(mat4Layout.byteLength / 4);
				const mat = mat4Map['uMatrix'] as { type: 'mat4x4f'; value: Float32Array };
				let tick = 0;
				return () => {
					tick += 1;
					mat.value[0] = tick;
					packUniformsInto(mat4Map, mat4Layout, mat4Out);
				};
			})()
		},
		{
			// findDirtyFloatRanges called on an unchanged buffer — most common per-frame case
			name: 'find_dirty_ranges_clean_frame_hz',
			batchSize: 200_000,
			fn: (() => {
				const size = 256; // 64 vec4f uniforms
				const prev = new Float32Array(size).fill(1);
				const next = new Float32Array(size).fill(1); // identical → no dirty ranges
				return () => {
					findDirtyFloatRanges(prev, next);
				};
			})()
		},
		{
			// Typical animated frame: one vec4 changes in a 64-vec4 uniform buffer.
			name: 'find_dirty_ranges_one_vec4_hz',
			batchSize: 100_000,
			fn: (() => {
				const previous = new Float32Array(256);
				const next = new Float32Array(256);
				next.fill(1, 0, 4);
				return () => {
					findDirtyFloatRanges(previous, next);
				};
			})()
		},
		{
			// Worst-case upload topology: 32 vec4 ranges separated by gaps larger than the merge threshold.
			name: 'find_dirty_ranges_32_fragmented_vec4_hz',
			batchSize: 20_000,
			fn: (() => {
				const previous = new Float32Array(256);
				const next = new Float32Array(256);
				for (let index = 0; index < 256; index += 8) {
					next.fill(1, index, index + 4);
				}
				return () => {
					findDirtyFloatRanges(previous, next);
				};
			})()
		},
		{
			// Composite of renderer.ts steady-state uniform work, excluding the WebGPU writeBuffer call.
			name: 'renderer_uniform_update_64_vec4_one_dirty_hz',
			batchSize: 5_000,
			fn: (() => {
				const values: Record<string, UniformValue> = {};
				for (let index = 0; index < 64; index += 1) {
					values[`u${index}`] = [index, index + 1, index + 2, index + 3] as [
						number,
						number,
						number,
						number
					];
				}
				const layout = resolveUniformLayout(values);
				const previous = new Float32Array(layout.byteLength / 4);
				const scratch = new Float32Array(layout.byteLength / 4);
				packUniformsIntoFast(values, layout, previous);
				let tick = 0;
				return () => {
					tick += 1;
					values['u0'] = [tick, 1, 2, 3] as [number, number, number, number];
					packUniformsIntoFast(values, layout, scratch);
					const dirtyRanges = findDirtyFloatRanges(previous, scratch);
					if (dirtyRanges.length > 0) {
						previous.set(scratch);
					}
				};
			})()
		},
		...createComputeResourceBenchmarkCases()
	];
}

type WorkerResult = Record<MetricKey, ProcessBenchmarkStats>;

function runWorker(args: BenchmarkArgs): WorkerResult {
	const result = {} as WorkerResult;
	for (const entry of shuffleCases(createCases(), args.seed)) {
		result[entry.name] = runCase(entry, args);
	}
	return result;
}

async function runWorkerProcess(args: BenchmarkArgs, processIndex: number): Promise<WorkerResult> {
	const workerSeed = (args.seed + Math.imul(processIndex + 1, 0x9e37_79b1)) >>> 0;
	const childArgs = [
		...process.execArgv,
		import.meta.filename,
		'--worker',
		`--samples=${args.sampleCount}`,
		`--warmup-ms=${args.warmupMs}`,
		`--seed=${Math.max(1, workerSeed)}`
	];

	return new Promise<WorkerResult>((resolveWorker, rejectWorker) => {
		const child = spawn(process.execPath, childArgs, {
			cwd: PACKAGE_ROOT,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: process.env
		});
		let stdout = '';
		let stderr = '';
		let settled = false;
		const settle = (callback: () => void): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeoutId);
			callback();
		};
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		const timeoutId = setTimeout(() => {
			if (settled) {
				return;
			}
			child.kill('SIGKILL');
			settle(() => {
				rejectWorker(
					new Error(
						`Core benchmark worker ${processIndex + 1} timed out after ${WORKER_TIMEOUT_MS}ms: ${stderr}`
					)
				);
			});
		}, WORKER_TIMEOUT_MS);
		child.once('error', (error) => {
			settle(() => {
				rejectWorker(
					new Error(
						`Core benchmark worker ${processIndex + 1} failed to start: ${String(error)}\n${stderr}`
					)
				);
			});
		});
		child.once('close', (code, signal) => {
			if (code !== 0) {
				settle(() => {
					rejectWorker(
						new Error(
							`Core benchmark worker ${processIndex + 1} failed (code=${String(code)}, signal=${String(signal)}): ${stderr}`
						)
					);
				});
				return;
			}
			try {
				const result = JSON.parse(stdout) as WorkerResult;
				settle(() => resolveWorker(result));
			} catch (error) {
				settle(() => {
					rejectWorker(
						new Error(
							`Core benchmark worker ${processIndex + 1} returned invalid JSON: ${String(error)}\n${stdout}\n${stderr}`
						)
					);
				});
			}
		});
	});
}

async function runCoreBenchmark(args: BenchmarkArgs): Promise<CoreBenchmarkDocument> {
	const processResults: WorkerResult[] = [];
	for (let processIndex = 0; processIndex < args.processCount; processIndex += 1) {
		console.error(`Core benchmark process ${processIndex + 1}/${args.processCount}`);
		processResults.push(await runWorkerProcess(args, processIndex));
	}

	const stats = {} as CoreBenchmarkDocument['stats'];
	const metrics = {} as MetricMap;
	for (const metric of Object.keys(METRIC_RULES) as MetricKey[]) {
		const processes = processResults.map((result) => {
			const value = result[metric];
			if (value === undefined) {
				throw new Error(`Core benchmark worker did not report metric ${metric}`);
			}
			return value;
		});
		const processMediansHz = processes.map((result) => result.median);
		const distribution = computeRobustStats(processMediansHz);
		stats[metric] = { processMediansHz, distribution, processes };
		metrics[metric] = distribution.median;
	}

	const environment = await collectBenchmarkEnvironment({
		repositoryRoot: REPOSITORY_ROOT,
		suiteFiles: [
			import.meta.filename,
			resolve(SCRIPT_DIR, 'benchmark-schema.ts'),
			resolve(SCRIPT_DIR, 'statistics.ts')
		]
	});

	return {
		schemaVersion: BENCHMARK_SCHEMA_VERSION,
		generatedAt: new Date().toISOString(),
		environment,
		config: {
			processCount: args.processCount,
			sampleCount: args.sampleCount,
			warmupMs: args.warmupMs,
			seed: args.seed,
			caseOrder: 'seeded-per-process'
		},
		metrics,
		stats
	};
}

function baselineIncompatibilities(
	result: CoreBenchmarkDocument,
	baseline: CoreBaselineDocument
): string[] {
	const differences = compareBenchmarkEnvironments(
		result.environment,
		baseline.environment
	).differences;
	for (const field of ['processCount', 'sampleCount', 'warmupMs', 'caseOrder'] as const) {
		if (result.config[field] !== baseline.config[field]) {
			differences.push(
				`config.${field}: current=${String(result.config[field])} baseline=${String(baseline.config[field])}`
			);
		}
	}
	return differences;
}

function assertBaselineCaptureIsControlled(result: CoreBenchmarkDocument): void {
	if (result.environment.dirty) {
		throw new Error('Refusing to update a performance baseline from a dirty worktree');
	}
	if (result.environment.powerMode !== 'ac-high-power') {
		throw new Error(
			`Refusing to update a performance baseline with powerMode=${result.environment.powerMode}; set SPEKTRAL_PERF_POWER_MODE=ac-high-power after controlling the host`
		);
	}
	if (result.config.processCount < DEFAULT_PROCESS_COUNT) {
		throw new Error(
			`Refusing to update a performance baseline with ${result.config.processCount} processes; at least ${DEFAULT_PROCESS_COUNT} are required`
		);
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	if (args.worker) {
		process.stdout.write(JSON.stringify(runWorker(args)));
		return;
	}

	const result = await runCoreBenchmark(args);
	if (args.updateBaseline) {
		assertBaselineCaptureIsControlled(result);
	}
	await writeJsonFile(LATEST_PATH, result);

	console.log(`Core benchmark saved: ${LATEST_PATH}`);
	for (const metricName of Object.keys(METRIC_RULES) as MetricKey[]) {
		console.log(`${metricName}: ${formatNumber(result.metrics[metricName])}`);
	}

	if (args.updateBaseline) {
		const baselinePayload: CoreBaselineDocument = {
			schemaVersion: BENCHMARK_SCHEMA_VERSION,
			updatedAt: new Date().toISOString(),
			environment: result.environment,
			config: result.config,
			metrics: result.metrics
		};
		await writeJsonFile(BASELINE_PATH, baselinePayload);
		console.log(`Baseline updated: ${BASELINE_PATH}`);
		return;
	}

	const baseline = await maybeReadBaseline();
	if (!baseline) {
		console.log(`Baseline not found: ${BASELINE_PATH}`);
		console.log('Run with --update-baseline to capture the first reference.');
		return;
	}
	if (baseline.schemaVersion !== BENCHMARK_SCHEMA_VERSION) {
		console.error(
			`Incompatible baseline schema: current=${BENCHMARK_SCHEMA_VERSION} baseline=${String(baseline.schemaVersion)}. Preserve and triage the old baseline before capturing schema v3.`
		);
		if (args.strict) {
			process.exitCode = 1;
		}
		return;
	}
	const incompatibilities = baselineIncompatibilities(result, baseline);
	if (incompatibilities.length > 0) {
		console.error('Incompatible baseline environment/configuration:');
		for (const difference of incompatibilities) {
			console.error(`- ${difference}`);
		}
		if (args.strict) {
			process.exitCode = 1;
		}
		return;
	}

	const { rows, regressions } = compareBenchmarkMetrics(
		result.metrics,
		baseline.metrics,
		METRIC_RULES
	);
	console.log('Comparison to baseline:');
	for (const row of rows) {
		if (row.baseline === null || row.deltaPct === null) {
			console.log(
				`${row.metric}: current=${formatNumber(row.current)} baseline=missing delta=n/a NEW_METRIC`
			);
			continue;
		}
		const sign = row.deltaPct >= 0 ? '+' : '';
		const state = row.regression ? 'REGRESSION' : 'ok';
		console.log(
			`${row.metric}: current=${formatNumber(row.current)} baseline=${formatNumber(row.baseline)} delta=${sign}${row.deltaPct.toFixed(2)}% threshold=${row.rule.maxRegressionPct}% (${row.rule.direction}) ${state}`
		);
	}

	if (regressions.length > 0) {
		console.error(`Detected ${regressions.length} regression(s).`);
		if (args.strict) {
			process.exitCode = 1;
		}
	}
}

void main();
