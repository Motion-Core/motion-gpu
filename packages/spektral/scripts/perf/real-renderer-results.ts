import type {
	RealRendererBrowserResult,
	ScenarioResult,
	Stats
} from './browser/real-renderer-benchmark';
import { computeRobustStats, quantile, type RobustStats } from './statistics';

export interface AggregatedStats extends Stats {
	runMedians: RobustStats;
}

export interface AggregatedScenario extends Omit<
	ScenarioResult,
	'cpuSubmitMs' | 'queueCompletionMs' | 'gpuFrameNs'
> {
	cpuSubmitMs: AggregatedStats;
	queueCompletionMs: AggregatedStats;
	gpuFrameNs: AggregatedStats;
}

export function summarizeSamples(samples: number[]): Stats {
	const sorted = [...samples].sort((a, b) => a - b);
	const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
	const variance = samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / samples.length;
	return {
		samples,
		median: quantile(sorted, 0.5),
		p95: quantile(sorted, 0.95),
		p99: quantile(sorted, 0.99),
		min: sorted[0] ?? 0,
		max: sorted.at(-1) ?? 0,
		coefficientOfVariationPct: mean === 0 ? 0 : (Math.sqrt(variance) / Math.abs(mean)) * 100
	};
}

export function aggregateStats(runs: Stats[]): AggregatedStats {
	return {
		...summarizeSamples(runs.flatMap((run) => run.samples)),
		runMedians: computeRobustStats(runs.map((run) => run.median))
	};
}

export function aggregateScenarios(results: RealRendererBrowserResult[]): AggregatedScenario[] {
	const first = results[0];
	if (!first) {
		throw new Error('At least one browser result is required');
	}
	return first.scenarios.map((scenario, scenarioIndex) => {
		const matches = results.map((result) => result.scenarios[scenarioIndex]);
		if (
			matches.some(
				(match) =>
					!match ||
					match.name !== scenario.name ||
					match.passCount !== scenario.passCount ||
					match.correctness.after !== scenario.correctness.after ||
					match.correctness.pixelCount !== scenario.correctness.pixelCount
			)
		) {
			throw new Error(
				`Browser runs disagreed on scenario contract or correctness: ${scenario.name}`
			);
		}
		const completeMatches = matches as ScenarioResult[];
		return {
			name: scenario.name,
			passCount: scenario.passCount,
			cpuSubmitMs: aggregateStats(completeMatches.map((match) => match.cpuSubmitMs)),
			queueCompletionMs: aggregateStats(completeMatches.map((match) => match.queueCompletionMs)),
			gpuFrameNs: aggregateStats(completeMatches.map((match) => match.gpuFrameNs)),
			correctness: scenario.correctness
		};
	});
}
