import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { arch, cpus, platform, release } from 'node:os';
import process from 'node:process';
import { chromium, type Browser, type Page } from '@playwright/test';
import { defineMaterial, resolveMaterial } from '../../src/lib/core/material';
import { buildShaderSource } from '../../src/lib/core/shader';
import { buildComputeShaderSource } from '../../src/lib/core/compute-shader';
import { resolveUniformLayout } from '../../src/lib/core/uniforms';

const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const BROWSER_RUNNER_PATH = resolve(SCRIPT_DIR, 'browser/hardware-benchmark.js');
const LATEST_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/gpu-latest.json');
const BASELINE_DIRECTORY = resolve(PACKAGE_ROOT, 'benchmarks/baselines');
const HARDWARE_SUITE_VERSION = 1;

const HARDWARE_LAUNCH_ARGS = [
	'--enable-unsafe-webgpu',
	'--enable-webgpu-developer-features',
	'--enable-dawn-features=allow_unsafe_apis',
	'--disable-dawn-features=timestamp_quantization',
	'--use-gpu-in-tests',
	'--use-webgpu-power-preference=default-high-performance',
	'--disable-background-timer-throttling',
	'--disable-renderer-backgrounding'
];

interface MetricRule {
	direction: 'higher' | 'lower';
	maxRegressionPct: number;
	maxRegressionAbsolute: number;
}

const gpuRule = (maxRegressionAbsolute: number): MetricRule => ({
	direction: 'lower',
	maxRegressionPct: 15,
	maxRegressionAbsolute
});
const COMPILE_RULE: MetricRule = {
	direction: 'lower',
	maxRegressionPct: 50,
	maxRegressionAbsolute: 1
};

const METRIC_RULES: Record<string, MetricRule> = {
	fragment_baseline_gpu_ns: gpuRule(20_000),
	fragment_baseline_compile_cold_ms: COMPILE_RULE,
	fragment_baseline_compile_warm_ms: COMPILE_RULE,
	fragment_srgb_encode_gpu_ns: gpuRule(20_000),
	fragment_srgb_encode_compile_cold_ms: COMPILE_RULE,
	fragment_srgb_encode_compile_warm_ms: COMPILE_RULE,
	fragment_hdr_target_gpu_ns: gpuRule(20_000),
	fragment_hdr_target_compile_cold_ms: COMPILE_RULE,
	fragment_hdr_target_compile_warm_ms: COMPILE_RULE,
	fragment_texture_9tap_gpu_ns: gpuRule(20_000),
	fragment_texture_9tap_compile_cold_ms: COMPILE_RULE,
	fragment_texture_9tap_compile_warm_ms: COMPILE_RULE,
	fragment_alu_96_gpu_ns: gpuRule(100_000),
	fragment_alu_96_compile_cold_ms: COMPILE_RULE,
	fragment_alu_96_compile_warm_ms: COMPILE_RULE,
	fragment_alu_96_512_gpu_ns: gpuRule(50_000),
	fragment_alu_96_2048_gpu_ns: gpuRule(250_000),
	compute_bandwidth_vec4_gpu_ns: gpuRule(100_000),
	compute_bandwidth_vec4_compile_cold_ms: COMPILE_RULE,
	compute_bandwidth_vec4_compile_warm_ms: COMPILE_RULE,
	compute_alu_128_gpu_ns: gpuRule(50_000),
	compute_alu_128_compile_cold_ms: COMPILE_RULE,
	compute_alu_128_compile_warm_ms: COMPILE_RULE
};

interface BenchmarkArgs {
	updateBaseline: boolean;
	strict: boolean;
	headed: boolean;
	channel: string;
}

interface RenderWorkload {
	kind: 'render';
	name: string;
	shaderCode: string;
	uniformByteLength: number;
	width: number;
	height: number;
	format: GPUTextureFormat;
	usesTexture: boolean;
	sampleCount: number;
	iterationsPerSample: number;
	warmupIterations: number;
	compileSamples: number;
}

interface ComputeWorkload {
	kind: 'compute';
	name: string;
	shaderCode: string;
	uniformByteLength: number;
	elementCount: number;
	storageByteLength: number;
	dispatchWorkgroups: number;
	sampleCount: number;
	iterationsPerSample: number;
	warmupIterations: number;
	compileSamples: number;
}

interface BenchmarkStats {
	samples: number[];
	mean: number;
	median: number;
	p95: number;
	min: number;
	max: number;
	coefficientOfVariationPct: number;
}

interface RenderWorkloadResult {
	kind: 'render';
	name: string;
	width: number;
	height: number;
	format: GPUTextureFormat;
	pixelsPerIteration: number;
	compileStatsMs: BenchmarkStats;
	gpuStatsNs: BenchmarkStats;
	submitToReadbackMs: number;
	throughputMPixelsPerSec: number;
}

interface ComputeWorkloadResult {
	kind: 'compute';
	name: string;
	elementCount: number;
	storageByteLength: number;
	dispatchWorkgroups: number;
	compileStatsMs: BenchmarkStats;
	gpuStatsNs: BenchmarkStats;
	submitToReadbackMs: number;
	throughputMElementsPerSec: number;
}

type WorkloadResult = RenderWorkloadResult | ComputeWorkloadResult;

interface BrowserBenchmarkResult {
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
	limits: {
		maxBufferSize: number;
		maxStorageBufferBindingSize: number;
		maxComputeWorkgroupsPerDimension: number;
	};
	workloads: WorkloadResult[];
}

interface HardwareBenchmarkDocument {
	schemaVersion: 1;
	generatedAt: string;
	fingerprint: string;
	environment: {
		node: string;
		platform: NodeJS.Platform;
		arch: string;
		osRelease: string;
		cpu: string;
		browserChannel: string;
		browserVersion: string;
		adapter: BrowserBenchmarkResult['adapter'];
		features: string[];
		limits: BrowserBenchmarkResult['limits'];
	};
	config: {
		suiteVersion: 1;
		renderResolutions: [number, number][];
		hardwareOnly: true;
		timestampQueries: true;
		renderTimestampStartMarker: '1x1-render-pass-end';
	};
	metrics: Record<string, number>;
	analysis: {
		fragmentAluNetNs: number;
		fragmentTextureNetNs: number;
		fragmentSrgbNetNs: number;
		fragmentHdrTargetRatio: number;
		fragmentAluScale512To1024: number;
		fragmentAluScale1024To2048: number;
		mostExpensiveGpuWorkload: string;
		mostVariableGpuWorkload: string;
	};
	workloads: WorkloadResult[];
}

interface HardwareBaselineDocument {
	schemaVersion: 1;
	updatedAt: string;
	fingerprint: string;
	environment: HardwareBenchmarkDocument['environment'];
	metrics: Record<string, number>;
}

interface ComparisonRow {
	metric: string;
	current: number;
	baseline: number | null;
	deltaPct: number | null;
	regression: boolean;
	rule: (typeof METRIC_RULES)[string];
}

function parseArgs(argv: string[]): BenchmarkArgs {
	const flags = new Set(argv);
	const channelFlag = argv.find((value) => value.startsWith('--channel='));
	return {
		updateBaseline: flags.has('--update-baseline'),
		strict: flags.has('--strict'),
		headed: flags.has('--headed'),
		channel:
			channelFlag?.slice('--channel='.length) ||
			process.env['MOTION_GPU_PERF_BROWSER_CHANNEL'] ||
			'chromium'
	};
}

function createRenderWorkload(input: {
	name: string;
	fragment: string;
	format?: GPUTextureFormat;
	textures?: Record<string, { source: null }>;
	convertLinearToSrgb?: boolean;
	iterationsPerSample: number;
	sampleCount?: number;
	warmupIterations?: number;
	width?: number;
	height?: number;
}): RenderWorkload {
	const material = defineMaterial({
		fragment: input.fragment,
		...(input.textures ? { textures: input.textures } : {})
	});
	const resolved = resolveMaterial(material);
	const shaderCode = buildShaderSource(
		resolved.fragmentWgsl,
		resolved.uniformLayout,
		resolved.textureKeys,
		input.convertLinearToSrgb ? { convertLinearToSrgb: true } : undefined
	);
	return {
		kind: 'render',
		name: input.name,
		shaderCode,
		uniformByteLength: resolved.uniformLayout.byteLength,
		width: input.width ?? 1024,
		height: input.height ?? 1024,
		format: input.format ?? 'rgba8unorm',
		usesTexture: resolved.textureKeys.length > 0,
		sampleCount: input.sampleCount ?? 30,
		iterationsPerSample: input.iterationsPerSample,
		warmupIterations: input.warmupIterations ?? 16,
		compileSamples: 5
	};
}

function createComputeWorkload(input: {
	name: string;
	compute: string;
	storageType: 'array<f32>' | 'array<vec4f>';
	elementCount: number;
	bytesPerElement: number;
	iterationsPerSample: number;
	sampleCount?: number;
}): ComputeWorkload {
	const uniformLayout = resolveUniformLayout({});
	const shaderCode = buildComputeShaderSource({
		compute: input.compute,
		uniformLayout,
		resources: [
			{
				kind: 'storage-buffer',
				alias: 'data',
				binding: 0,
				access: 'storage-read-write',
				wgslType: input.storageType
			}
		]
	});
	return {
		kind: 'compute',
		name: input.name,
		shaderCode,
		uniformByteLength: uniformLayout.byteLength,
		elementCount: input.elementCount,
		storageByteLength: input.elementCount * input.bytesPerElement,
		dispatchWorkgroups: Math.ceil(input.elementCount / 256),
		sampleCount: input.sampleCount ?? 30,
		iterationsPerSample: input.iterationsPerSample,
		warmupIterations: 6,
		compileSamples: 5
	};
}

function createWorkloads(): {
	renderWorkloads: RenderWorkload[];
	computeWorkloads: ComputeWorkload[];
} {
	const baselineFragment = `
fn frag(uv: vec2f) -> vec4f {
	let value = 0.25 + uv.x * 0.5;
	return vec4f(value, uv.y, 1.0 - value, 1.0);
}
`;
	const textureFragment = `
fn frag(uv: vec2f) -> vec4f {
	let texel = 1.0 / motiongpuFrame.resolution;
	var color = textureSample(uSource, uSourceSampler, uv) * 0.2;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f(-1.0, -1.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f( 0.0, -1.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f( 1.0, -1.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f(-1.0,  0.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f( 1.0,  0.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f(-1.0,  1.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f( 0.0,  1.0)) * 0.1;
	color += textureSample(uSource, uSourceSampler, uv + texel * vec2f( 1.0,  1.0)) * 0.1;
	return vec4f(color.rgb, 1.0);
}
`;
	const aluFragment = `
fn frag(uv: vec2f) -> vec4f {
	var z = vec3f((uv - vec2f(0.5)) * 2.0, 0.35);
	var accumulator = 0.0;
	for (var index = 0; index < 96; index += 1) {
		let phase = f32(index) * 0.013 + motiongpuFrame.time * 0.001;
		let radius2 = max(dot(z, z), 0.08);
		z = abs(z) / radius2 - vec3f(0.72, 0.65, 0.58);
		accumulator += sin(dot(z, vec3f(1.7, 2.1, 2.7)) + phase) * 0.004;
	}
	let value = 0.5 + accumulator;
	return vec4f(value, value * 0.8, 1.0 - value, 1.0);
}
`;

	const bandwidthElementCount = 4_194_304;
	const computeBandwidth = `
const ELEMENT_COUNT: u32 = ${bandwidthElementCount}u;

@compute @workgroup_size(256)
fn compute(@builtin(global_invocation_id) globalId: vec3u) {
	if (globalId.x >= ELEMENT_COUNT) {
		return;
	}
	let value = data[globalId.x];
	data[globalId.x] = value * vec4f(1.000001, 0.999999, 1.000002, 0.999998) + vec4f(0.00001);
}
`;
	const aluElementCount = 262_144;
	const computeAlu = `
const ELEMENT_COUNT: u32 = ${aluElementCount}u;

@compute @workgroup_size(256)
fn compute(@builtin(global_invocation_id) globalId: vec3u) {
	if (globalId.x >= ELEMENT_COUNT) {
		return;
	}
	var value = data[globalId.x] + f32(globalId.x) * 0.000001 + motiongpuFrame.time * 0.000001;
	for (var index = 0; index < 128; index += 1) {
		value = sin(value * 1.00013 + f32(index) * 0.0007) * 0.5 + 0.5;
	}
	data[globalId.x] = value;
}
`;

	return {
		renderWorkloads: [
			createRenderWorkload({
				name: 'fragment_alu_96',
				fragment: aluFragment,
				iterationsPerSample: 1,
				sampleCount: 24,
				warmupIterations: 24
			}),
			createRenderWorkload({
				name: 'fragment_alu_96_512',
				fragment: aluFragment,
				iterationsPerSample: 1,
				sampleCount: 20,
				warmupIterations: 12,
				width: 512,
				height: 512
			}),
			createRenderWorkload({
				name: 'fragment_alu_96_2048',
				fragment: aluFragment,
				iterationsPerSample: 1,
				sampleCount: 18,
				warmupIterations: 12,
				width: 2048,
				height: 2048
			}),
			createRenderWorkload({
				name: 'fragment_texture_9tap',
				fragment: textureFragment,
				textures: { uSource: { source: null } },
				iterationsPerSample: 1
			}),
			createRenderWorkload({
				name: 'fragment_baseline',
				fragment: baselineFragment,
				iterationsPerSample: 1
			}),
			createRenderWorkload({
				name: 'fragment_srgb_encode',
				fragment: baselineFragment,
				convertLinearToSrgb: true,
				iterationsPerSample: 1
			}),
			createRenderWorkload({
				name: 'fragment_hdr_target',
				fragment: baselineFragment,
				format: 'rgba16float',
				iterationsPerSample: 1
			})
		],
		computeWorkloads: [
			createComputeWorkload({
				name: 'compute_bandwidth_vec4',
				compute: computeBandwidth,
				storageType: 'array<vec4f>',
				elementCount: bandwidthElementCount,
				bytesPerElement: 16,
				iterationsPerSample: 3
			}),
			createComputeWorkload({
				name: 'compute_alu_128',
				compute: computeAlu,
				storageType: 'array<f32>',
				elementCount: aluElementCount,
				bytesPerElement: 4,
				iterationsPerSample: 2,
				sampleCount: 24
			})
		]
	};
}

async function startSecureOriginServer(): Promise<{ server: Server; url: string }> {
	const server = createServer((_request, response) => {
		response.writeHead(200, {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store'
		});
		response.end(
			'<!doctype html><html><head><title>MotionGPU GPU benchmark</title></head><body></body></html>'
		);
	});
	await new Promise<void>((resolveListen, rejectListen) => {
		server.once('error', rejectListen);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', rejectListen);
			resolveListen();
		});
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Unable to resolve hardware benchmark server address');
	}
	return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function stopServer(server: Server): Promise<void> {
	await new Promise<void>((resolveClose, rejectClose) => {
		server.close((error) => {
			if (error) {
				rejectClose(error);
			} else {
				resolveClose();
			}
		});
	});
}

async function runBrowserBenchmark(
	page: Page,
	payload: ReturnType<typeof createWorkloads>
): Promise<BrowserBenchmarkResult> {
	const runnerSource = await readFile(BROWSER_RUNNER_PATH, 'utf8');
	await page.addScriptTag({ content: runnerSource });
	return page.evaluate(async (workloads) => {
		const runner = (
			globalThis as typeof globalThis & {
				__MOTION_GPU_HARDWARE_BENCHMARK__?: (
					input: typeof workloads
				) => Promise<BrowserBenchmarkResult>;
			}
		).__MOTION_GPU_HARDWARE_BENCHMARK__;
		if (!runner) {
			throw new Error('Hardware benchmark browser runner was not installed');
		}
		return runner(workloads);
	}, payload);
}

function browserMajor(version: string): string {
	return version.split('.')[0] ?? version;
}

function createFingerprint(input: {
	browserChannel: string;
	browserVersion: string;
	adapter: BrowserBenchmarkResult['adapter'];
}): string {
	const identity = JSON.stringify({
		suiteVersion: HARDWARE_SUITE_VERSION,
		platform: platform(),
		arch: arch(),
		osRelease: release(),
		browserChannel: input.browserChannel,
		browserMajor: browserMajor(input.browserVersion),
		adapter: input.adapter
	});
	return createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
}

function baselinePathFor(result: HardwareBenchmarkDocument): string {
	const adapterSlug = slugify(result.environment.adapter.description) || 'gpu';
	return resolve(BASELINE_DIRECTORY, `${adapterSlug}-${result.fingerprint}.json`);
}

function extractMetrics(workloads: WorkloadResult[]): Record<string, number> {
	const metrics: Record<string, number> = {};
	for (const workload of workloads) {
		metrics[`${workload.name}_gpu_ns`] = workload.gpuStatsNs.median;
		metrics[`${workload.name}_compile_cold_ms`] = workload.compileStatsMs.samples[0] ?? 0;
		const warmSamples = workload.compileStatsMs.samples.slice(1).sort((a, b) => a - b);
		metrics[`${workload.name}_compile_warm_ms`] =
			warmSamples[Math.floor((warmSamples.length - 1) * 0.5)] ?? 0;
	}
	return metrics;
}

function workloadByName(workloads: WorkloadResult[], name: string): WorkloadResult {
	const workload = workloads.find((entry) => entry.name === name);
	if (!workload) {
		throw new Error(`Missing workload result: ${name}`);
	}
	return workload;
}

function analyzeWorkloads(workloads: WorkloadResult[]): HardwareBenchmarkDocument['analysis'] {
	const baseline = workloadByName(workloads, 'fragment_baseline').gpuStatsNs.median;
	const srgb = workloadByName(workloads, 'fragment_srgb_encode').gpuStatsNs.median;
	const hdr = workloadByName(workloads, 'fragment_hdr_target').gpuStatsNs.median;
	const texture = workloadByName(workloads, 'fragment_texture_9tap').gpuStatsNs.median;
	const alu = workloadByName(workloads, 'fragment_alu_96').gpuStatsNs.median;
	const alu512 = workloadByName(workloads, 'fragment_alu_96_512').gpuStatsNs.median;
	const alu2048 = workloadByName(workloads, 'fragment_alu_96_2048').gpuStatsNs.median;
	const mostExpensive = [...workloads].sort((a, b) => b.gpuStatsNs.median - a.gpuStatsNs.median)[0];
	const mostVariable = [...workloads].sort(
		(a, b) => b.gpuStatsNs.coefficientOfVariationPct - a.gpuStatsNs.coefficientOfVariationPct
	)[0];
	return {
		fragmentAluNetNs: Math.max(0, alu - baseline),
		fragmentTextureNetNs: Math.max(0, texture - baseline),
		fragmentSrgbNetNs: Math.max(0, srgb - baseline),
		fragmentHdrTargetRatio: baseline === 0 ? 0 : hdr / baseline,
		fragmentAluScale512To1024: alu512 === 0 ? 0 : alu / alu512,
		fragmentAluScale1024To2048: alu === 0 ? 0 : alu2048 / alu,
		mostExpensiveGpuWorkload: mostExpensive?.name ?? '',
		mostVariableGpuWorkload: mostVariable?.name ?? ''
	};
}

function compareAgainstBaseline(
	current: Record<string, number>,
	baseline: Record<string, number>
): { rows: ComparisonRow[]; regressions: ComparisonRow[] } {
	const rows: ComparisonRow[] = [];
	for (const [metric, rule] of Object.entries(METRIC_RULES)) {
		const currentValue = current[metric];
		if (currentValue === undefined) {
			throw new Error(`Current hardware benchmark is missing metric ${metric}`);
		}
		const baselineValue = baseline[metric];
		if (baselineValue === undefined) {
			rows.push({
				metric,
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
		const regressionPct = rule.direction === 'lower' ? deltaPct : -deltaPct;
		const regressionAbsolute =
			rule.direction === 'lower' ? currentValue - baselineValue : baselineValue - currentValue;
		const regression =
			regressionPct > rule.maxRegressionPct && regressionAbsolute > rule.maxRegressionAbsolute;
		rows.push({
			metric,
			current: currentValue,
			baseline: baselineValue,
			deltaPct,
			regression,
			rule
		});
	}
	return { rows, regressions: rows.filter((row) => row.regression) };
}

async function maybeReadBaseline(path: string): Promise<HardwareBaselineDocument | null> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as HardwareBaselineDocument;
	} catch (error) {
		const candidate = error as NodeJS.ErrnoException;
		if (candidate.code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}

async function writeJsonFile(path: string, payload: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function formatMetric(metric: string, value: number): string {
	return metric.endsWith('_gpu_ns')
		? `${(value / 1_000_000).toFixed(4)} ms`
		: `${value.toFixed(3)} ms`;
}

async function runHardwareBenchmark(args: BenchmarkArgs): Promise<HardwareBenchmarkDocument> {
	const origin = await startSecureOriginServer();
	let browser: Browser | null = null;
	try {
		browser = await chromium.launch({
			channel: args.channel,
			headless: !args.headed,
			args: HARDWARE_LAUNCH_ARGS
		});
		const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
		const page = await context.newPage();
		await page.goto(origin.url);
		const browserResult = await runBrowserBenchmark(page, createWorkloads());
		const browserVersion = browser.version();
		const fingerprint = createFingerprint({
			browserChannel: args.channel,
			browserVersion,
			adapter: browserResult.adapter
		});
		const metrics = extractMetrics(browserResult.workloads);
		for (const metric of Object.keys(METRIC_RULES)) {
			if (metrics[metric] === undefined) {
				throw new Error(`Hardware benchmark did not produce required metric ${metric}`);
			}
		}
		return {
			schemaVersion: 1,
			generatedAt: new Date().toISOString(),
			fingerprint,
			environment: {
				node: process.version,
				platform: platform(),
				arch: arch(),
				osRelease: release(),
				cpu: cpus()[0]?.model ?? 'unknown',
				browserChannel: args.channel,
				browserVersion,
				adapter: browserResult.adapter,
				features: browserResult.features,
				limits: browserResult.limits
			},
			config: {
				suiteVersion: HARDWARE_SUITE_VERSION,
				renderResolutions: [
					[512, 512],
					[1024, 1024],
					[2048, 2048]
				],
				hardwareOnly: true,
				timestampQueries: true,
				renderTimestampStartMarker: '1x1-render-pass-end'
			},
			metrics,
			analysis: analyzeWorkloads(browserResult.workloads),
			workloads: browserResult.workloads
		};
	} finally {
		await browser?.close();
		await stopServer(origin.server);
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const result = await runHardwareBenchmark(args);
	await writeJsonFile(LATEST_PATH, result);

	console.log(`Hardware GPU benchmark saved: ${LATEST_PATH}`);
	console.log(
		`Adapter: ${result.environment.adapter.description} (${result.environment.adapter.backend}, ${result.environment.adapter.type})`
	);
	console.log(
		`Driver: ${result.environment.adapter.driver}; browser=${result.environment.browserVersion}; fingerprint=${result.fingerprint}`
	);
	for (const [metric, value] of Object.entries(result.metrics)) {
		console.log(`${metric}: ${formatMetric(metric, value)}`);
	}
	console.log(
		`Analysis: ALU net=${(result.analysis.fragmentAluNetNs / 1_000_000).toFixed(4)} ms, texture net=${(result.analysis.fragmentTextureNetNs / 1_000_000).toFixed(4)} ms, sRGB net=${(result.analysis.fragmentSrgbNetNs / 1_000_000).toFixed(4)} ms, HDR ratio=${result.analysis.fragmentHdrTargetRatio.toFixed(2)}x, ALU scale 512→1024=${result.analysis.fragmentAluScale512To1024.toFixed(2)}x, 1024→2048=${result.analysis.fragmentAluScale1024To2048.toFixed(2)}x`
	);

	const baselinePath = baselinePathFor(result);
	if (args.updateBaseline) {
		const baseline: HardwareBaselineDocument = {
			schemaVersion: 1,
			updatedAt: new Date().toISOString(),
			fingerprint: result.fingerprint,
			environment: result.environment,
			metrics: result.metrics
		};
		await writeJsonFile(baselinePath, baseline);
		console.log(`Hardware baseline updated: ${baselinePath}`);
		return;
	}

	const baseline = await maybeReadBaseline(baselinePath);
	if (!baseline) {
		console.log(`Hardware baseline not found for this adapter/browser: ${baselinePath}`);
		console.log('Run perf:gpu:baseline on this exact machine to create it.');
		if (args.strict) {
			process.exitCode = 1;
		}
		return;
	}
	if (baseline.fingerprint !== result.fingerprint) {
		throw new Error(
			`Hardware baseline fingerprint mismatch: current=${result.fingerprint}, baseline=${baseline.fingerprint}`
		);
	}

	const { rows, regressions } = compareAgainstBaseline(result.metrics, baseline.metrics);
	console.log('Comparison to hardware baseline:');
	for (const row of rows) {
		if (row.baseline === null || row.deltaPct === null) {
			console.log(
				`${row.metric}: current=${formatMetric(row.metric, row.current)} baseline=missing NEW_METRIC`
			);
			continue;
		}
		const sign = row.deltaPct >= 0 ? '+' : '';
		console.log(
			`${row.metric}: current=${formatMetric(row.metric, row.current)} baseline=${formatMetric(row.metric, row.baseline)} delta=${sign}${row.deltaPct.toFixed(2)}% thresholds=${row.rule.maxRegressionPct}%+${formatMetric(row.metric, row.rule.maxRegressionAbsolute)} ${row.regression ? 'REGRESSION' : 'ok'}`
		);
	}
	if (regressions.length > 0) {
		console.error(`Detected ${regressions.length} hardware GPU regression(s).`);
		if (args.strict) {
			process.exitCode = 1;
		}
	}
}

void main();
