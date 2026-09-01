import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { BENCHMARK_SCHEMA_VERSION, collectBenchmarkEnvironment } from './benchmark-schema';
import {
	assertComputeTopologyVerdicts,
	compareComputeTopologyScenario,
	COMPUTE_TOPOLOGY_SCENARIOS,
	validateComputeTopologyWorkerResult,
	type ComputeTopologyArm,
	type ComputeTopologyComparison,
	type ComputeTopologyScenario,
	type ComputeTopologyWorkerResult
} from './compute-topology-paired-contract';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const WORKER_PATH = resolve(SCRIPT_DIR, 'compute-topology-paired-worker.ts');
const CONTRACT_PATH = resolve(SCRIPT_DIR, 'compute-topology-paired-contract.ts');
const RESULT_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/compute-topology-paired-latest.json');
const EVIDENCE_PATH = resolve(PACKAGE_ROOT, 'benchmarks/compute-topology-paired-evidence.md');

interface Args {
	runsPerArm: number;
	seed: number;
}

interface ProcessResult extends ComputeTopologyWorkerResult {
	readonly orderIndex: number;
	readonly armIndex: number;
}

function numericArg(argv: string[], name: string, fallback: number): number {
	const raw = argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];
	const value = raw === undefined ? fallback : Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive integer, received ${String(raw)}`);
	}
	return value;
}

function parseArgs(argv: string[]): Args {
	return {
		runsPerArm: numericArg(argv, 'runs', 10),
		seed: numericArg(argv, 'seed', 0x5317cafe)
	};
}

function createRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

/** Balanced paired blocks; each pair alternates arms and randomizes which arm starts. */
function pairedOrder(runsPerArm: number, seed: number): ComputeTopologyArm[] {
	const next = createRandom(seed);
	return Array.from({ length: runsPerArm }, () =>
		next() < 0.5 ? (['legacy', 'cached'] as const) : (['cached', 'legacy'] as const)
	).flat();
}

async function runWorker(
	arm: ComputeTopologyArm,
	seed: number
): Promise<ComputeTopologyWorkerResult> {
	const tsxCli = require.resolve('tsx/cli');
	const { stdout } = await execFileAsync(
		process.execPath,
		[tsxCli, WORKER_PATH, `--arm=${arm}`, `--seed=${seed}`],
		{
			cwd: REPOSITORY_ROOT,
			env: process.env,
			encoding: 'utf8',
			maxBuffer: 20 * 1024 * 1024
		}
	);
	const result = JSON.parse(stdout) as ComputeTopologyWorkerResult;
	validateComputeTopologyWorkerResult(result);
	if (result.node !== process.version || result.arm !== arm) {
		throw new Error(`Worker identity mismatch for ${arm}: ${result.node}/${result.arm}`);
	}
	return result;
}

function processMetric(
	processes: readonly ProcessResult[],
	arm: ComputeTopologyArm,
	scenario: ComputeTopologyScenario
): number[] {
	return processes
		.filter((result) => result.arm === arm)
		.map((result) => result.results[String(scenario) as `${ComputeTopologyScenario}`].throughputHz);
}

function fixed(value: number): string {
	return Number.isFinite(value)
		? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
		: 'n/a';
}

function evidenceMarkdown(input: {
	runsPerArm: number;
	seed: number;
	workerHash: string;
	comparisons: Record<`${ComputeTopologyScenario}`, ComputeTopologyComparison>;
}): string {
	const rows = COMPUTE_TOPOLOGY_SCENARIOS.map((scenario) => {
		const comparison = input.comparisons[String(scenario) as `${ComputeTopologyScenario}`];
		return `| ${scenario} | ${fixed(comparison.legacy.median)} | ${fixed(comparison.cached.median)} | ${comparison.medianRatio.toFixed(3)}x | ${comparison.medianDeltaPct.toFixed(2)}% | ${comparison.medianDeltaCi.lower.toFixed(2)}%–${comparison.medianDeltaCi.upper.toFixed(2)}% | ${comparison.verdict} |`;
	});
	return `# Compute topology resolver paired A/B evidence

This evidence compares the legacy renderer path (public defensive \`pass.getResources()\` followed by \`resolveComputePassResources\`) with the renderer-owned static-topology cache. Both arms use the same worker, pass instances, four real external buffers per pass, timing harness, checksum and Node process launcher.

- Runtime: ${process.version}
- Independent fresh processes: ${input.runsPerArm} per arm (${input.runsPerArm * 2} total)
- Process order: balanced pairs, alternating within each pair, seeded random starting arm
- Per-process scenario order: independently seeded shuffle
- Seed: ${input.seed}
- Worker SHA-256: \`${input.workerHash}\`
- Raw samples: \`benchmarks/results/compute-topology-paired-latest.json\`
- 32-pass acceptance: median cached throughput >=2.0x legacy
- 0/4/16 regression contract: regression requires the 95% bootstrap CI upper bound below -10%, an absolute loss above 25,000 frames/s, and a loss larger than 3x the larger arm MAD
- Cached steady-state contract: zero plan, entry, read, write, layout-entry or topology-key allocations after warmup

| Passes | Legacy median Hz | Cached median Hz | Ratio | Median delta | 95% delta CI | Verdict |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}

All worker checksums matched. This is a local CPU-side topology-resolution benchmark; it does not claim GPU timing or CI portability.
`;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const order = pairedOrder(args.runsPerArm, args.seed);
	const counts: Record<ComputeTopologyArm, number> = { legacy: 0, cached: 0 };
	const processes: ProcessResult[] = [];
	for (const [orderIndex, arm] of order.entries()) {
		counts[arm] += 1;
		const result = await runWorker(arm, args.seed + orderIndex * 9973);
		processes.push({ ...result, orderIndex, armIndex: counts[arm] });
		const summary = COMPUTE_TOPOLOGY_SCENARIOS.map(
			(scenario) =>
				`${scenario}=${result.results[String(scenario) as `${ComputeTopologyScenario}`].throughputHz.toFixed(0)}Hz`
		).join(' ');
		console.log(`[${orderIndex + 1}/${order.length}] ${arm} ${summary}`);
	}

	const comparisons = Object.fromEntries(
		COMPUTE_TOPOLOGY_SCENARIOS.map((scenario, index) => [
			String(scenario),
			compareComputeTopologyScenario({
				legacy: processMetric(processes, 'legacy', scenario),
				cached: processMetric(processes, 'cached', scenario),
				scenario,
				seed: args.seed + index
			})
		])
	) as Record<`${ComputeTopologyScenario}`, ComputeTopologyComparison>;
	assertComputeTopologyVerdicts(comparisons);

	const [workerSource, contractSource, environment] = await Promise.all([
		readFile(WORKER_PATH),
		readFile(CONTRACT_PATH),
		collectBenchmarkEnvironment({
			repositoryRoot: REPOSITORY_ROOT,
			suiteFiles: [
				import.meta.filename,
				WORKER_PATH,
				CONTRACT_PATH,
				resolve(SCRIPT_DIR, 'statistics.ts')
			]
		})
	]);
	const workerHash = createHash('sha256').update(workerSource).update(contractSource).digest('hex');
	const document = {
		schemaVersion: BENCHMARK_SCHEMA_VERSION,
		generatedAt: new Date().toISOString(),
		environment,
		config: {
			...args,
			order,
			workerHash,
			protocol: 'same-checkout-identical-worker-fresh-process-paired-ab',
			scenarios: COMPUTE_TOPOLOGY_SCENARIOS,
			resourcesPerPass: 4
		},
		processes,
		comparisons
	};
	await mkdir(dirname(RESULT_PATH), { recursive: true });
	await writeFile(RESULT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
	await writeFile(EVIDENCE_PATH, evidenceMarkdown({ ...args, workerHash, comparisons }), 'utf8');
	for (const scenario of COMPUTE_TOPOLOGY_SCENARIOS) {
		const comparison = comparisons[String(scenario) as `${ComputeTopologyScenario}`];
		console.log(
			`${scenario} passes: ${comparison.medianRatio.toFixed(3)}x (${comparison.medianDeltaPct.toFixed(2)}%), CI=[${comparison.medianDeltaCi.lower.toFixed(2)}, ${comparison.medianDeltaCi.upper.toFixed(2)}], ${comparison.verdict}`
		);
	}
	console.log(`Saved ${RESULT_PATH}`);
}

void main();
