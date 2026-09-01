import {
	bootstrapMedianRelativeChangeConfidenceInterval,
	computeRobustStats,
	median,
	type ConfidenceInterval,
	type RobustStats
} from './statistics';

export const COMPUTE_TOPOLOGY_SCENARIOS = [0, 4, 16, 32] as const;
export type ComputeTopologyScenario = (typeof COMPUTE_TOPOLOGY_SCENARIOS)[number];
export type ComputeTopologyArm = 'legacy' | 'cached';

export interface ComputeTopologyWorkerResult {
	readonly node: string;
	readonly arm: ComputeTopologyArm;
	readonly scenarioOrder: readonly ComputeTopologyScenario[];
	readonly results: Record<
		`${ComputeTopologyScenario}`,
		{
			readonly throughputHz: number;
			readonly rawSamples: readonly number[];
			readonly checksum: number;
			readonly expectedChecksum: number;
			readonly steadyStateAllocationDelta: {
				readonly planBuilds: number;
				readonly entriesAllocated: number;
				readonly readsAllocated: number;
				readonly writesAllocated: number;
				readonly layoutEntriesAllocated: number;
				readonly topologyKeysAllocated: number;
			};
		}
	>;
}

export interface ComputeTopologyComparison {
	readonly legacy: RobustStats;
	readonly cached: RobustStats;
	readonly medianRatio: number;
	readonly medianDeltaPct: number;
	readonly medianDeltaCi: ConfidenceInterval;
	readonly absoluteMedianDeltaHz: number;
	readonly practicalRegressionThresholdPct: number;
	readonly absoluteRegressionThresholdHz: number;
	readonly noiseThresholdHz: number;
	readonly verdict: 'speedup-confirmed' | 'no-significant-regression' | 'regression-confirmed';
}

export const SMALL_SCENARIO_REGRESSION_PCT = 10;
export const ABSOLUTE_REGRESSION_FLOOR_HZ = 25_000;

export function validateComputeTopologyWorkerResult(result: ComputeTopologyWorkerResult): void {
	if (result.node.length === 0 || (result.arm !== 'legacy' && result.arm !== 'cached')) {
		throw new Error('Invalid compute-topology worker identity.');
	}
	for (const scenario of COMPUTE_TOPOLOGY_SCENARIOS) {
		const sample = result.results[String(scenario) as `${ComputeTopologyScenario}`];
		if (!sample || sample.rawSamples.length < 5) {
			throw new Error(`Scenario ${scenario} is missing raw samples.`);
		}
		if (
			!sample.rawSamples.every((value) => Number.isFinite(value) && value > 0) ||
			!Number.isFinite(sample.throughputHz) ||
			sample.throughputHz <= 0
		) {
			throw new Error(`Scenario ${scenario} contains invalid throughput.`);
		}
		if (sample.checksum !== sample.expectedChecksum) {
			throw new Error(`Scenario ${scenario} checksum mismatch.`);
		}
		if (
			result.arm === 'cached' &&
			Object.values(sample.steadyStateAllocationDelta).some((value) => value !== 0)
		) {
			throw new Error(`Scenario ${scenario} allocated topology descriptors in steady state.`);
		}
	}
}

export function compareComputeTopologyScenario(input: {
	legacy: readonly number[];
	cached: readonly number[];
	scenario: ComputeTopologyScenario;
	seed: number;
}): ComputeTopologyComparison {
	const legacyMedian = median(input.legacy);
	const cachedMedian = median(input.cached);
	const medianRatio = cachedMedian / legacyMedian;
	const medianDeltaPct = (medianRatio - 1) * 100;
	const medianDeltaCi = bootstrapMedianRelativeChangeConfidenceInterval(
		input.legacy,
		input.cached,
		{ seed: input.seed, iterations: 30_000 }
	);
	const legacyStats = computeRobustStats(input.legacy);
	const cachedStats = computeRobustStats(input.cached);
	const absoluteMedianDeltaHz = cachedMedian - legacyMedian;
	const noiseThresholdHz = 3 * Math.max(legacyStats.mad, cachedStats.mad);
	const isPracticalRegression =
		medianDeltaCi.upper < -SMALL_SCENARIO_REGRESSION_PCT &&
		absoluteMedianDeltaHz < -ABSOLUTE_REGRESSION_FLOOR_HZ &&
		Math.abs(absoluteMedianDeltaHz) > noiseThresholdHz;
	return {
		legacy: legacyStats,
		cached: cachedStats,
		medianRatio,
		medianDeltaPct,
		medianDeltaCi,
		absoluteMedianDeltaHz,
		practicalRegressionThresholdPct: SMALL_SCENARIO_REGRESSION_PCT,
		absoluteRegressionThresholdHz: ABSOLUTE_REGRESSION_FLOOR_HZ,
		noiseThresholdHz,
		verdict:
			input.scenario === 32 && medianRatio >= 2
				? 'speedup-confirmed'
				: isPracticalRegression
					? 'regression-confirmed'
					: 'no-significant-regression'
	};
}

export function assertComputeTopologyVerdicts(
	comparisons: Readonly<Record<`${ComputeTopologyScenario}`, ComputeTopologyComparison>>
): void {
	if (comparisons['32'].medianRatio < 2) {
		throw new Error(
			`32-pass cached resolver must reach >=2.0x legacy throughput; received ${comparisons['32'].medianRatio.toFixed(3)}x.`
		);
	}
	for (const scenario of [0, 4, 16] as const) {
		if (
			comparisons[String(scenario) as `${ComputeTopologyScenario}`].verdict ===
			'regression-confirmed'
		) {
			throw new Error(`Scenario ${scenario} has a significant cached resolver regression.`);
		}
	}
}
