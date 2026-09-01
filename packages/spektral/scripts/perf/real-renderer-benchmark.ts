import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import {
	BENCHMARK_SCHEMA_VERSION,
	collectBenchmarkEnvironment,
	type AdapterIdentity,
	type BenchmarkEnvironment
} from './benchmark-schema';
import type { RealRendererBrowserResult, ScenarioResult } from './browser/real-renderer-benchmark';
import { aggregateScenarios, type AggregatedScenario } from './real-renderer-results';

const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const BROWSER_ROOT = resolve(SCRIPT_DIR, 'browser');
const ENTRY_PATH = resolve(BROWSER_ROOT, 'real-renderer-benchmark.ts');
const HTML_PATH = resolve(BROWSER_ROOT, 'real-renderer.html');
const LATEST_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/real-renderer-latest.json');
const BASELINE_DIRECTORY = resolve(PACKAGE_ROOT, 'benchmarks/baselines');
const SUITE_VERSION = 1;

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

interface Args {
	channel: string;
	headed: boolean;
	runs: number;
	updateBaseline: boolean;
}

interface RealRendererDocument {
	schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
	generatedAt: string;
	fingerprint: string;
	environment: BenchmarkEnvironment;
	config: RealRendererBrowserResult['config'] & {
		suiteVersion: number;
		browserRuns: number;
		hardwareOnly: true;
		timestampQueries: true;
		correctnessSink: 'canvas-checksum-rgb-range-and-compute-sentinel';
	};
	features: string[];
	scenarios: AggregatedScenario[];
	runs: Array<{
		index: number;
		config: RealRendererBrowserResult['config'];
		features: string[];
		scenarios: ScenarioResult[];
	}>;
}

function parseArgs(argv: string[]): Args {
	const flags = new Set(argv);
	const channelFlag = argv.find((value) => value.startsWith('--channel='));
	const runsFlag = argv.find((value) => value.startsWith('--runs='));
	const runs = Number(runsFlag?.slice('--runs='.length) ?? 5);
	if (!Number.isInteger(runs) || runs < 1) {
		throw new Error(`--runs must be a positive integer, received ${String(runs)}`);
	}
	return {
		channel:
			channelFlag?.slice('--channel='.length) ||
			process.env['SPEKTRAL_PERF_BROWSER_CHANNEL'] ||
			'chromium',
		headed: flags.has('--headed'),
		runs,
		updateBaseline: flags.has('--update-baseline')
	};
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '')
		.slice(0, 48);
}

function fingerprint(input: {
	environment: BenchmarkEnvironment;
	channel: string;
	browserVersion: string;
}): string {
	const identity = {
		suiteVersion: SUITE_VERSION,
		platform: input.environment.platform,
		arch: input.environment.arch,
		osRelease: input.environment.osRelease,
		channel: input.channel,
		browserMajor: input.browserVersion.split('.')[0] ?? input.browserVersion,
		adapter: input.environment.adapter,
		suiteHash: input.environment.suiteHash
	};
	return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
}

async function startServer(): Promise<{ server: PreviewServer; url: string; outDir: string }> {
	const outDir = await mkdtemp(resolve(tmpdir(), 'spektral-real-renderer-'));
	let server: PreviewServer | null = null;
	try {
		await build({
			configFile: false,
			root: BROWSER_ROOT,
			logLevel: process.env['SPEKTRAL_PERF_VERBOSE'] === '1' ? 'info' : 'warn',
			build: {
				outDir,
				emptyOutDir: true,
				modulePreload: false,
				rollupOptions: { input: HTML_PATH }
			}
		});
		server = await preview({
			configFile: false,
			root: BROWSER_ROOT,
			build: { outDir },
			preview: {
				host: '127.0.0.1',
				port: 0,
				strictPort: false,
				headers: {
					'Cross-Origin-Embedder-Policy': 'require-corp',
					'Cross-Origin-Opener-Policy': 'same-origin'
				}
			},
			logLevel: process.env['SPEKTRAL_PERF_VERBOSE'] === '1' ? 'info' : 'warn'
		});
		const address = server.httpServer.address();
		if (!address || typeof address === 'string') {
			throw new Error('Unable to resolve real-renderer preview address');
		}
		return { server, url: `http://127.0.0.1:${address.port}/real-renderer.html`, outDir };
	} catch (error) {
		await server?.close();
		await rm(outDir, { recursive: true, force: true });
		throw error;
	}
}

async function runBrowser(page: Page): Promise<RealRendererBrowserResult> {
	return page.evaluate(async () => {
		const runner = window.__SPEKTRAL_REAL_RENDERER_BENCHMARK__;
		if (!runner) {
			throw new Error('Real-renderer benchmark runner was not installed');
		}
		return runner();
	});
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

async function run(args: Args): Promise<RealRendererDocument> {
	const { server, url, outDir } = await startServer();
	try {
		const browserResults: RealRendererBrowserResult[] = [];
		let browserVersion = '';
		for (let index = 0; index < args.runs; index += 1) {
			let browser: Browser | null = null;
			try {
				browser = await chromium.launch({
					channel: args.channel,
					headless: !args.headed,
					args: HARDWARE_LAUNCH_ARGS
				});
				browserVersion ||= browser.version();
				if (browser.version() !== browserVersion) {
					throw new Error(
						`Browser version changed within benchmark: ${browserVersion} -> ${browser.version()}`
					);
				}
				const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
				await page.goto(url);
				browserResults.push(await runBrowser(page));
			} finally {
				await browser?.close();
			}
		}
		const browserResult = browserResults[0];
		if (!browserResult) {
			throw new Error('Real-renderer benchmark completed no browser runs');
		}
		for (const result of browserResults.slice(1)) {
			if (
				JSON.stringify(result.adapter) !== JSON.stringify(browserResult.adapter) ||
				JSON.stringify(result.features) !== JSON.stringify(browserResult.features)
			) {
				throw new Error('GPU adapter identity or features changed between browser runs');
			}
		}
		const environment = await collectBenchmarkEnvironment({
			repositoryRoot: REPOSITORY_ROOT,
			suiteFiles: [
				import.meta.filename,
				ENTRY_PATH,
				HTML_PATH,
				resolve(SCRIPT_DIR, 'benchmark-schema.ts'),
				resolve(SCRIPT_DIR, 'real-renderer-results.ts'),
				resolve(SCRIPT_DIR, 'statistics.ts')
			],
			overrides: {
				browser: { channel: args.channel, version: browserVersion, engine: 'Chromium' },
				adapter: browserResult.adapter satisfies AdapterIdentity
			}
		});
		return {
			schemaVersion: BENCHMARK_SCHEMA_VERSION,
			generatedAt: new Date().toISOString(),
			fingerprint: fingerprint({ environment, channel: args.channel, browserVersion }),
			environment,
			config: {
				suiteVersion: SUITE_VERSION,
				browserRuns: args.runs,
				hardwareOnly: true,
				timestampQueries: true,
				correctnessSink: 'canvas-checksum-rgb-range-and-compute-sentinel',
				...browserResult.config
			},
			features: browserResult.features,
			scenarios: aggregateScenarios(browserResults),
			runs: browserResults.map((result, index) => ({
				index,
				config: result.config,
				features: result.features,
				scenarios: result.scenarios
			}))
		};
	} finally {
		await server.close();
		await rm(outDir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const result = await run(args);
	await writeJson(LATEST_PATH, result);
	console.log(`Real-renderer benchmark saved: ${LATEST_PATH}`);
	console.log(
		`Adapter: ${result.environment.adapter?.description ?? 'unknown'}; fingerprint=${result.fingerprint}`
	);
	for (const scenario of result.scenarios) {
		console.log(
			`${scenario.name}: CPU submit run-p50=${scenario.cpuSubmitMs.runMedians.median.toFixed(3)}ms pooled-p95=${scenario.cpuSubmitMs.p95.toFixed(3)}ms; GPU completion span run-p50=${(scenario.gpuFrameNs.runMedians.median / 1_000_000).toFixed(3)}ms pooled-p95=${(scenario.gpuFrameNs.p95 / 1_000_000).toFixed(3)}ms pooled-p99=${(scenario.gpuFrameNs.p99 / 1_000_000).toFixed(3)}ms; queue completion run-p50=${scenario.queueCompletionMs.runMedians.median.toFixed(3)}ms; checksum=${scenario.correctness.after}; compute=${String(scenario.correctness.computeSentinelAfter)}`
		);
	}
	if (args.updateBaseline) {
		if (result.config.browserRuns < 5) {
			throw new Error(
				`Refusing baseline update with browserRuns=${result.config.browserRuns}; use at least 5 independent browser sessions`
			);
		}
		if (result.environment.dirty) {
			throw new Error('Refusing to update a real-renderer baseline from a dirty worktree');
		}
		if (result.environment.powerMode !== 'ac-high-power') {
			throw new Error(
				`Refusing baseline update with powerMode=${result.environment.powerMode}; control the host and set SPEKTRAL_PERF_POWER_MODE=ac-high-power`
			);
		}
		const adapterSlug = slugify(result.environment.adapter?.description ?? '') || 'gpu';
		const path = resolve(
			BASELINE_DIRECTORY,
			`${adapterSlug}-real-renderer-${result.fingerprint}.json`
		);
		if (await pathExists(path)) {
			throw new Error(`Refusing to overwrite existing real-renderer baseline: ${path}`);
		}
		await writeJson(path, result);
		console.log(`Real-renderer baseline created: ${path}`);
	}
}

void main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
