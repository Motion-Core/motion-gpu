import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Page } from '@playwright/test';

const HARNESS_URL = 'http://127.0.0.1:4175/?scenario=perf';
const SERVER_URL = 'http://127.0.0.1:4175';
const SCRIPT_DIR = import.meta.dirname;
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '../..');
const BASELINE_PATH = resolve(PACKAGE_ROOT, 'benchmarks/runtime-baseline.json');
const LATEST_PATH = resolve(PACKAGE_ROOT, 'benchmarks/results/runtime-latest.json');

const BROWSER_LAUNCH_ARGS = [
	'--enable-unsafe-webgpu',
	'--use-angle=swiftshader',
	'--enable-features=Vulkan',
	'--disable-vulkan-surface'
] as const;

const MODE_SAMPLE_MS = 4_000;
const IDLE_SETTLE_MS = 700;
const MANUAL_ADVANCE_DURATION_MS = 4_000;
const MANUAL_ADVANCE_INTERVAL_MS = 16;

const METRIC_RULES = {
	always_scheduler_hz: { direction: 'higher', maxRegressionPct: 18 },
	always_render_hz: { direction: 'higher', maxRegressionPct: 18 },
	on_demand_idle_scheduler_hz: { direction: 'lower', maxRegressionPct: 30 },
	on_demand_idle_render_hz: { direction: 'lower', maxRegressionPct: 30 },
	manual_idle_scheduler_hz: { direction: 'lower', maxRegressionPct: 30 },
	manual_idle_render_hz: { direction: 'lower', maxRegressionPct: 30 },
	manual_advance_scheduler_hz: { direction: 'higher', maxRegressionPct: 20 },
	manual_advance_render_hz: { direction: 'higher', maxRegressionPct: 20 }
} as const;

type MetricKey = keyof typeof METRIC_RULES;

type MetricMap = Record<MetricKey, number>;

interface ModeSample {
	elapsedSec: number;
	schedulerDelta: number;
	renderDelta: number;
	schedulerHz: number;
	renderHz: number;
}

interface RuntimeBenchmarkDocument {
	schemaVersion: 1;
	generatedAt: string;
	environment: {
		node: string;
		platform: NodeJS.Platform;
		arch: string;
	};
	config: {
		modeSampleMs: number;
		idleSettleMs: number;
		manualAdvanceDurationMs: number;
		manualAdvanceIntervalMs: number;
	};
	metrics: MetricMap;
	samples: {
		always: ModeSample;
		onDemandIdle: ModeSample;
		manualIdle: ModeSample;
		manualAdvance: ModeSample & { pulses: number };
	};
}

interface RuntimeBaselineDocument {
	schemaVersion: 1;
	updatedAt: string;
	metrics: MetricMap;
}

interface ComparisonRow {
	metric: MetricKey;
	current: number;
	baseline: number;
	deltaPct: number;
	regression: boolean;
	rule: (typeof METRIC_RULES)[MetricKey];
}

type PerfWindow = Window &
	typeof globalThis & {
		__MOTION_GPU_PERF__?: {
			setMode: (mode: 'always' | 'on-demand' | 'manual') => void;
			invalidate: () => void;
			advance: () => void;
		};
	};

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

function delay(ms: number): Promise<void> {
	return new Promise((resolveDelay) => {
		setTimeout(resolveDelay, ms);
	});
}

async function waitForServer(url: string, timeoutMs = 45_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown = null;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
			lastError = new Error(`Server responded with status ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await delay(250);
	}

	throw new Error(`Timed out waiting for ${url}. Last error: ${String(lastError)}`);
}

function startHarnessServer(): ChildProcess {
	const child = spawn('bun', ['run', 'e2e:serve'], {
		cwd: PACKAGE_ROOT,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	if (process.env['MOTION_GPU_PERF_VERBOSE'] === '1') {
		child.stdout?.on('data', (chunk) => {
			process.stdout.write(`[perf-server] ${String(chunk)}`);
		});
		child.stderr?.on('data', (chunk) => {
			process.stderr.write(`[perf-server] ${String(chunk)}`);
		});
	}

	return child;
}

async function stopHarnessServer(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	child.kill('SIGTERM');

	const settled = await Promise.race([
		once(child, 'exit').then(() => true),
		delay(2_000).then(() => false)
	]);

	if (settled) {
		return;
	}

	child.kill('SIGKILL');
	await once(child, 'exit');
}

async function waitForTestIdText(
	page: Page,
	testId: string,
	expected: string,
	timeoutMs = 10_000
): Promise<void> {
	await page.waitForFunction(
		([id, expectedValue]) => {
			const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
			return element?.textContent?.trim() === expectedValue;
		},
		[testId, expected],
		{ timeout: timeoutMs }
	);
}

async function setMode(page: Page, mode: 'always' | 'on-demand' | 'manual'): Promise<void> {
	await page.evaluate((nextMode) => {
		const perfWindow = window as PerfWindow;
		perfWindow.__MOTION_GPU_PERF__?.setMode(nextMode);
	}, mode);
	await waitForTestIdText(page, 'render-mode', mode);
}

async function sampleMode(page: Page, durationMs: number): Promise<ModeSample> {
	return page.evaluate(async (duration) => {
		const readCount = (id: string): number => {
			const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
			if (!element) {
				throw new Error(`Missing test id: ${id}`);
			}

			const parsed = Number(element.textContent ?? '');
			if (!Number.isFinite(parsed)) {
				throw new Error(`Expected numeric text for "${id}", got "${element.textContent ?? ''}"`);
			}

			return parsed;
		};

		const startScheduler = readCount('scheduler-count');
		const startRender = readCount('render-count');
		const startedAt = performance.now();

		await new Promise<void>((resolveSample) => {
			setTimeout(resolveSample, duration);
		});

		const endedAt = performance.now();
		const endScheduler = readCount('scheduler-count');
		const endRender = readCount('render-count');
		const elapsedSec = Math.max(0.001, (endedAt - startedAt) / 1000);
		const schedulerDelta = endScheduler - startScheduler;
		const renderDelta = endRender - startRender;

		return {
			elapsedSec,
			schedulerDelta,
			renderDelta,
			schedulerHz: schedulerDelta / elapsedSec,
			renderHz: renderDelta / elapsedSec
		};
	}, durationMs);
}

async function sampleManualAdvance(page: Page): Promise<ModeSample & { pulses: number }> {
	return page.evaluate(
		async ({ durationMs, intervalMs }) => {
			const readCount = (id: string): number => {
				const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
				if (!element) {
					throw new Error(`Missing test id: ${id}`);
				}

				const parsed = Number(element.textContent ?? '');
				if (!Number.isFinite(parsed)) {
					throw new Error(`Expected numeric text for "${id}", got "${element.textContent ?? ''}"`);
				}

				return parsed;
			};

			const perfWindow = window as PerfWindow;
			const api = perfWindow.__MOTION_GPU_PERF__;
			if (!api) {
				throw new Error('window.__MOTION_GPU_PERF__ is not available');
			}

			const startScheduler = readCount('scheduler-count');
			const startRender = readCount('render-count');
			const startedAt = performance.now();
			let pulses = 0;

			while (performance.now() - startedAt < durationMs) {
				api.advance();
				pulses += 1;
				await new Promise<void>((resolvePulse) => {
					setTimeout(resolvePulse, intervalMs);
				});
			}

			const endedAt = performance.now();
			const endScheduler = readCount('scheduler-count');
			const endRender = readCount('render-count');
			const elapsedSec = Math.max(0.001, (endedAt - startedAt) / 1000);
			const schedulerDelta = endScheduler - startScheduler;
			const renderDelta = endRender - startRender;

			return {
				elapsedSec,
				schedulerDelta,
				renderDelta,
				schedulerHz: schedulerDelta / elapsedSec,
				renderHz: renderDelta / elapsedSec,
				pulses
			};
		},
		{
			durationMs: MANUAL_ADVANCE_DURATION_MS,
			intervalMs: MANUAL_ADVANCE_INTERVAL_MS
		}
	);
}

function compareAgainstBaseline(
	current: MetricMap,
	baseline: MetricMap
): {
	rows: ComparisonRow[];
	regressions: ComparisonRow[];
} {
	const rows: ComparisonRow[] = [];

	for (const metricName of Object.keys(METRIC_RULES) as MetricKey[]) {
		const rule = METRIC_RULES[metricName];
		const currentValue = current[metricName];
		const baselineValue = baseline[metricName];
		const deltaPct =
			baselineValue === 0
				? currentValue === 0
					? 0
					: Number.POSITIVE_INFINITY
				: ((currentValue - baselineValue) / baselineValue) * 100;
		const regression =
			baselineValue === 0
				? rule.direction === 'lower'
					? currentValue > 0
					: currentValue < 0
				: rule.direction === 'higher'
					? deltaPct < -rule.maxRegressionPct
					: deltaPct > rule.maxRegressionPct;

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

function formatNumber(value: number): string {
	return value.toFixed(2);
}

async function maybeReadBaseline(): Promise<RuntimeBaselineDocument | null> {
	try {
		const raw = await readFile(BASELINE_PATH, 'utf8');
		return JSON.parse(raw) as RuntimeBaselineDocument;
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

async function runRuntimeBenchmark(): Promise<RuntimeBenchmarkDocument> {
	const browser = await chromium.launch({
		headless: true,
		args: [...BROWSER_LAUNCH_ARGS]
	});

	try {
		const context = await browser.newContext({
			viewport: {
				width: 1280,
				height: 720
			}
		});
		const page = await context.newPage();

		await page.goto(HARNESS_URL);
		await waitForTestIdText(page, 'scenario', 'perf');
		await waitForTestIdText(page, 'controls-ready', 'yes');
		await waitForTestIdText(page, 'gpu-status', 'ready');
		await waitForTestIdText(page, 'last-error', 'none');
		await page.waitForFunction(
			() => {
				const perfWindow = window as PerfWindow;
				return Boolean(perfWindow.__MOTION_GPU_PERF__);
			},
			null,
			{
				timeout: 10_000
			}
		);

		await setMode(page, 'always');
		await page.waitForTimeout(IDLE_SETTLE_MS);
		const alwaysSample = await sampleMode(page, MODE_SAMPLE_MS);

		await setMode(page, 'on-demand');
		await page.waitForTimeout(IDLE_SETTLE_MS);
		const onDemandIdleSample = await sampleMode(page, MODE_SAMPLE_MS);

		await setMode(page, 'manual');
		await page.waitForTimeout(IDLE_SETTLE_MS);
		const manualIdleSample = await sampleMode(page, MODE_SAMPLE_MS);
		const manualAdvanceSample = await sampleManualAdvance(page);

		const metrics: MetricMap = {
			always_scheduler_hz: alwaysSample.schedulerHz,
			always_render_hz: alwaysSample.renderHz,
			on_demand_idle_scheduler_hz: onDemandIdleSample.schedulerHz,
			on_demand_idle_render_hz: onDemandIdleSample.renderHz,
			manual_idle_scheduler_hz: manualIdleSample.schedulerHz,
			manual_idle_render_hz: manualIdleSample.renderHz,
			manual_advance_scheduler_hz: manualAdvanceSample.schedulerHz,
			manual_advance_render_hz: manualAdvanceSample.renderHz
		};

		return {
			schemaVersion: 1,
			generatedAt: new Date().toISOString(),
			environment: {
				node: process.version,
				platform: process.platform,
				arch: process.arch
			},
			config: {
				modeSampleMs: MODE_SAMPLE_MS,
				idleSettleMs: IDLE_SETTLE_MS,
				manualAdvanceDurationMs: MANUAL_ADVANCE_DURATION_MS,
				manualAdvanceIntervalMs: MANUAL_ADVANCE_INTERVAL_MS
			},
			metrics,
			samples: {
				always: alwaysSample,
				onDemandIdle: onDemandIdleSample,
				manualIdle: manualIdleSample,
				manualAdvance: manualAdvanceSample
			}
		};
	} finally {
		await browser.close();
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const server = startHarnessServer();

	try {
		await waitForServer(SERVER_URL);
		const result = await runRuntimeBenchmark();
		await writeJsonFile(LATEST_PATH, result);

		console.log(`Runtime benchmark saved: ${LATEST_PATH}`);
		for (const metricName of Object.keys(METRIC_RULES) as MetricKey[]) {
			console.log(`${metricName}: ${formatNumber(result.metrics[metricName])}`);
		}

		if (args.updateBaseline) {
			const baselinePayload: RuntimeBaselineDocument = {
				schemaVersion: 1,
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
	} finally {
		await stopHarnessServer(server);
	}
}

void main();
