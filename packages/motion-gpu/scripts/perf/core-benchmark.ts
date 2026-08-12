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
import { createComputeStorageBindGroupCache } from '../../src/lib/core/compute-bindgroup-cache';
import type { FrameState, RenderPass, UniformValue } from '../../src/lib/core/types';

const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const BASELINE_PATH = resolve(PACKAGE_ROOT, 'benchmarks/baselines/core.json');
const LATEST_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/core-latest.json');

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
	compute_bindgroup_cache_hit_hz: { direction: 'higher', maxRegressionPct: 15 }
} as const;

type MetricKey = keyof typeof METRIC_RULES;
type MetricMap = Record<MetricKey, number>;

interface BenchmarkStats {
	meanHz: number;
	p95Hz: number;
	minHz: number;
	maxHz: number;
	samples: number[];
}

interface CoreBenchmarkDocument {
	schemaVersion: 2;
	generatedAt: string;
	environment: {
		node: string;
		platform: NodeJS.Platform;
		arch: string;
	};
	metrics: MetricMap;
	stats: Record<MetricKey, BenchmarkStats>;
}

interface CoreBaselineDocument {
	schemaVersion: 2;
	updatedAt: string;
	metrics: Partial<MetricMap>;
}

interface ComparisonRow {
	metric: MetricKey;
	current: number;
	baseline: number | null;
	deltaPct: number | null;
	regression: boolean;
	rule: (typeof METRIC_RULES)[MetricKey];
}

interface BenchmarkCase {
	name: MetricKey;
	batchSize: number;
	fn: () => void;
}

function parseArgs(argv: string[]): {
	updateBaseline: boolean;
	strict: boolean;
} {
	const flags = new Set(argv);
	return {
		updateBaseline: flags.has('--update-baseline'),
		strict: flags.has('--strict')
	};
}

function computeStats(samples: number[]): BenchmarkStats {
	const sorted = [...samples].sort((a, b) => a - b);
	const sampleCount = sorted.length;
	const sum = sorted.reduce((acc, value) => acc + value, 0);
	const p95Index = Math.min(sampleCount - 1, Math.floor(sampleCount * 0.95));
	const p95Hz = sorted[p95Index] ?? 0;
	const minHz = sorted[0] ?? 0;
	const maxHz = sorted[sampleCount - 1] ?? 0;

	return {
		meanHz: sampleCount > 0 ? sum / sampleCount : 0,
		p95Hz,
		minHz,
		maxHz,
		samples
	};
}

function runCase(target: BenchmarkCase): BenchmarkStats {
	const warmupUntil = performance.now() + 400;
	while (performance.now() < warmupUntil) {
		target.fn();
	}

	const samples: number[] = [];
	for (let sampleIndex = 0; sampleIndex < 24; sampleIndex += 1) {
		const startedAt = performance.now();
		for (let index = 0; index < target.batchSize; index += 1) {
			target.fn();
		}
		const elapsedSec = Math.max(0.000001, (performance.now() - startedAt) / 1000);
		samples.push(target.batchSize / elapsedSec);
	}

	return computeStats(samples);
}

function compareAgainstBaseline(
	current: MetricMap,
	baseline: Partial<MetricMap>
): {
	rows: ComparisonRow[];
	regressions: ComparisonRow[];
} {
	const rows: ComparisonRow[] = [];

	for (const metricName of Object.keys(METRIC_RULES) as MetricKey[]) {
		const rule = METRIC_RULES[metricName];
		const currentValue = current[metricName];
		const baselineValue = baseline[metricName];
		if (baselineValue === undefined) {
			rows.push({
				metric: metricName,
				current: currentValue,
				baseline: null,
				deltaPct: null,
				regression: false,
				rule
			});
			continue;
		}
		const deltaPct =
			baselineValue === 0
				? currentValue === 0
					? 0
					: Number.POSITIVE_INFINITY
				: ((currentValue - baselineValue) / baselineValue) * 100;
		const regression = baselineValue === 0 ? currentValue < 0 : deltaPct < -rule.maxRegressionPct;

		rows.push({
			metric: metricName,
			current: currentValue,
			baseline: baselineValue,
			deltaPct,
			regression,
			rule
		});
	}

	return {
		rows,
		regressions: rows.filter((row) => row.regression)
	};
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
	const bindGroupRequest = {
		topologyKey: 'data:read-write',
		layoutEntries: [
			{
				binding: 0,
				visibility: 0x20,
				buffer: { type: 'storage' as const }
			}
		],
		bindGroupEntries: [{ binding: 0, resource: { buffer: bindGroupResource } }],
		resourceRefs: [bindGroupResource]
	};
	const bindGroupCache = createComputeStorageBindGroupCache({
		createBindGroupLayout: () => ({}) as GPUBindGroupLayout,
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
		}
	];
}

function runCoreBenchmark(): CoreBenchmarkDocument {
	const cases = createCases();
	const stats = {} as Record<MetricKey, BenchmarkStats>;
	const metrics = {} as MetricMap;

	for (const entry of cases) {
		const caseStats = runCase(entry);
		stats[entry.name] = caseStats;
		metrics[entry.name] = caseStats.meanHz;
	}

	return {
		schemaVersion: 2,
		generatedAt: new Date().toISOString(),
		environment: {
			node: process.version,
			platform: process.platform,
			arch: process.arch
		},
		metrics,
		stats
	};
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const result = runCoreBenchmark();
	await writeJsonFile(LATEST_PATH, result);

	console.log(`Core benchmark saved: ${LATEST_PATH}`);
	for (const metricName of Object.keys(METRIC_RULES) as MetricKey[]) {
		console.log(`${metricName}: ${formatNumber(result.metrics[metricName])}`);
	}

	if (args.updateBaseline) {
		const baselinePayload: CoreBaselineDocument = {
			schemaVersion: 2,
			updatedAt: new Date().toISOString(),
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

	const { rows, regressions } = compareAgainstBaseline(result.metrics, baseline.metrics);
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
