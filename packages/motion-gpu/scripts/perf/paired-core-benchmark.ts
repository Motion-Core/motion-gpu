import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import {
	BENCHMARK_SCHEMA_VERSION,
	collectBenchmarkEnvironment,
	type BenchmarkEnvironment
} from './benchmark-schema';
import {
	bootstrapMedianRelativeChangeConfidenceInterval,
	computeRobustStats,
	median,
	type ConfidenceInterval,
	type RobustStats
} from './statistics';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const HISTORICAL_RUNNER_PATH = 'packages/motion-gpu/scripts/perf/core-benchmark.ts';
const WORKER_PATH = resolve(SCRIPT_DIR, 'paired-core-worker.ts');
const CHECKOUT_WORKER_PATH = 'packages/motion-gpu/scripts/perf/paired-core-worker.ts';
const LATEST_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/core-paired-ab-latest.json');
const METRICS = ['resolve_material_cached_hz', 'find_dirty_ranges_clean_frame_hz'] as const;
const REGRESSION_THRESHOLD_PCT = 15;

type Metric = (typeof METRICS)[number];
type Arm = 'baseline' | 'current';

interface Args {
	baselineRef: string;
	currentRef: string;
	runsPerArm: number;
	seed: number;
}

interface HistoricalResult {
	node: string;
	metrics: Record<Metric, number>;
	withinProcessSamples: Record<Metric, number[]>;
}

interface ProcessResult {
	orderIndex: number;
	arm: Arm;
	armIndex: number;
	metrics: Record<Metric, number>;
	withinProcessSamples: Record<Metric, number[]>;
}

interface MetricComparison {
	baseline: RobustStats;
	current: RobustStats;
	medianDeltaPct: number;
	medianDeltaCi: ConfidenceInterval;
	regressionThresholdPct: number;
	verdict: 'regression-confirmed' | 'regression-ruled-out' | 'inconclusive';
}

interface PairedCoreDocument {
	schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
	generatedAt: string;
	environment: BenchmarkEnvironment;
	config: Args & {
		baselineSha: string;
		currentSha: string;
		workerHash: string;
		originalBaselineRunnerBlob: string;
		originalCurrentRunnerBlob: string;
		runnerProtocol: 'identical-focused-worker-injected-into-both-checkouts';
		order: Arm[];
		metrics: readonly Metric[];
	};
	processes: ProcessResult[];
	comparisons: Record<Metric, MetricComparison>;
}

function numericArg(argv: string[], name: string, fallback: number): number {
	const raw = argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];
	const value = raw === undefined ? fallback : Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive integer, received ${String(raw)}`);
	}
	return value;
}

function stringArg(argv: string[], name: string, fallback: string): string {
	return argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function parseArgs(argv: string[]): Args {
	return {
		baselineRef: stringArg(argv, 'baseline', '6f2f21b5'),
		currentRef: stringArg(argv, 'current', 'a520031c'),
		runsPerArm: numericArg(argv, 'runs', 20),
		seed: numericArg(argv, 'seed', 0x4d475055)
	};
}

function createRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

function shuffledOrder(runsPerArm: number, seed: number): Arm[] {
	const order: Arm[] = [
		...Array.from({ length: runsPerArm }, () => 'baseline' as const),
		...Array.from({ length: runsPerArm }, () => 'current' as const)
	];
	const random = createRandom(seed);
	for (let index = order.length - 1; index > 0; index -= 1) {
		const target = Math.floor(random() * (index + 1));
		[order[index], order[target]] = [order[target] ?? 'baseline', order[index] ?? 'current'];
	}
	return order;
}

async function gitOutput(args: string[]): Promise<string> {
	const { stdout } = await execFileAsync('git', args, {
		cwd: REPOSITORY_ROOT,
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024
	});
	return stdout.trim();
}

async function extractRef(ref: string, destination: string): Promise<void> {
	const archivePath = `${destination}.tar`;
	await execFileAsync('git', ['archive', '--format=tar', `--output=${archivePath}`, ref], {
		cwd: REPOSITORY_ROOT
	});
	try {
		await execFileAsync('tar', ['-xf', archivePath, '-C', destination]);
	} finally {
		await rm(archivePath, { force: true });
	}
}

async function runHistoricalProcess(checkout: string): Promise<HistoricalResult> {
	const runner = resolve(checkout, CHECKOUT_WORKER_PATH);
	const tsxCli = require.resolve('tsx/cli');
	const { stdout } = await execFileAsync(process.execPath, [tsxCli, runner], {
		cwd: checkout,
		env: process.env,
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024
	});
	return JSON.parse(stdout) as HistoricalResult;
}

function compareMetric(baseline: number[], current: number[], seed: number): MetricComparison {
	const medianDeltaPct = (median(current) / median(baseline) - 1) * 100;
	const medianDeltaCi = bootstrapMedianRelativeChangeConfidenceInterval(baseline, current, {
		seed,
		iterations: 50_000
	});
	const verdict =
		medianDeltaCi.upper < -REGRESSION_THRESHOLD_PCT
			? 'regression-confirmed'
			: medianDeltaCi.lower > -REGRESSION_THRESHOLD_PCT
				? 'regression-ruled-out'
				: 'inconclusive';
	return {
		baseline: computeRobustStats(baseline),
		current: computeRobustStats(current),
		medianDeltaPct,
		medianDeltaCi,
		regressionThresholdPct: REGRESSION_THRESHOLD_PCT,
		verdict
	};
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function run(args: Args): Promise<PairedCoreDocument> {
	const [
		baselineSha,
		currentSha,
		originalBaselineRunnerBlob,
		originalCurrentRunnerBlob,
		workerSource
	] = await Promise.all([
		gitOutput(['rev-parse', `${args.baselineRef}^{commit}`]),
		gitOutput(['rev-parse', `${args.currentRef}^{commit}`]),
		gitOutput(['rev-parse', `${args.baselineRef}:${HISTORICAL_RUNNER_PATH}`]),
		gitOutput(['rev-parse', `${args.currentRef}:${HISTORICAL_RUNNER_PATH}`]),
		readFile(WORKER_PATH)
	]);
	const workerHash = createHash('sha256').update(workerSource).digest('hex');
	const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'motion-gpu-core-paired-ab-'));
	const baselineCheckout = resolve(temporaryRoot, 'baseline');
	const currentCheckout = resolve(temporaryRoot, 'current');
	await Promise.all([mkdir(baselineCheckout), mkdir(currentCheckout)]);
	try {
		await Promise.all([
			extractRef(baselineSha, baselineCheckout),
			extractRef(currentSha, currentCheckout)
		]);
		await Promise.all([
			copyFile(WORKER_PATH, resolve(baselineCheckout, CHECKOUT_WORKER_PATH)),
			copyFile(WORKER_PATH, resolve(currentCheckout, CHECKOUT_WORKER_PATH))
		]);
		const order = shuffledOrder(args.runsPerArm, args.seed);
		const armCounts: Record<Arm, number> = { baseline: 0, current: 0 };
		const processes: ProcessResult[] = [];
		for (const [orderIndex, arm] of order.entries()) {
			armCounts[arm] += 1;
			const result = await runHistoricalProcess(
				arm === 'baseline' ? baselineCheckout : currentCheckout
			);
			if (result.node !== process.version) {
				throw new Error(`Focused worker used ${result.node}, expected ${process.version}`);
			}
			processes.push({
				orderIndex,
				arm,
				armIndex: armCounts[arm],
				metrics: Object.fromEntries(
					METRICS.map((metric) => [metric, result.metrics[metric]])
				) as Record<Metric, number>,
				withinProcessSamples: result.withinProcessSamples
			});
			console.log(
				`[${orderIndex + 1}/${order.length}] ${arm} cached=${result.metrics.resolve_material_cached_hz.toFixed(0)}Hz clean=${result.metrics.find_dirty_ranges_clean_frame_hz.toFixed(0)}Hz`
			);
		}

		const environment = await collectBenchmarkEnvironment({
			repositoryRoot: REPOSITORY_ROOT,
			suiteFiles: [
				import.meta.filename,
				resolve(SCRIPT_DIR, 'benchmark-schema.ts'),
				WORKER_PATH,
				resolve(SCRIPT_DIR, 'statistics.ts')
			]
		});
		const comparisons = Object.fromEntries(
			METRICS.map((metric, index) => [
				metric,
				compareMetric(
					processes
						.filter((result) => result.arm === 'baseline')
						.map((result) => result.metrics[metric]),
					processes
						.filter((result) => result.arm === 'current')
						.map((result) => result.metrics[metric]),
					args.seed + index
				)
			])
		) as Record<Metric, MetricComparison>;
		return {
			schemaVersion: BENCHMARK_SCHEMA_VERSION,
			generatedAt: new Date().toISOString(),
			environment,
			config: {
				...args,
				baselineSha,
				currentSha,
				workerHash,
				originalBaselineRunnerBlob,
				originalCurrentRunnerBlob,
				runnerProtocol: 'identical-focused-worker-injected-into-both-checkouts',
				order,
				metrics: METRICS
			},
			processes,
			comparisons
		};
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const result = await run(parseArgs(process.argv.slice(2)));
	await writeJson(LATEST_PATH, result);
	console.log(`Paired core A/B saved: ${LATEST_PATH}`);
	for (const metric of METRICS) {
		const comparison = result.comparisons[metric];
		console.log(
			`${metric}: delta=${comparison.medianDeltaPct.toFixed(2)}% CI=[${comparison.medianDeltaCi.lower.toFixed(2)}, ${comparison.medianDeltaCi.upper.toFixed(2)}]% verdict=${comparison.verdict}`
		);
	}
}

void main();
