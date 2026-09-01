import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBenchmarkMetrics } from './benchmark-regression';

const rules = {
	throughput: { direction: 'higher', maxRegressionPct: 15 },
	latency: { direction: 'lower', maxRegressionPct: 25 }
} as const;

test('artificially degraded metrics cross the strict regression thresholds', () => {
	const comparison = compareBenchmarkMetrics(
		{ throughput: 84, latency: 126 },
		{ throughput: 100, latency: 100 },
		rules
	);

	assert.deepEqual(
		comparison.regressions.map(({ metric }) => metric),
		['throughput', 'latency']
	);
});

test('threshold boundaries pass and missing metrics remain informational', () => {
	const comparison = compareBenchmarkMetrics(
		{ throughput: 85, latency: 125 },
		{ throughput: 100 },
		rules
	);

	assert.equal(comparison.regressions.length, 0);
	assert.deepEqual(comparison.rows[1], {
		metric: 'latency',
		current: 125,
		baseline: null,
		deltaPct: null,
		regression: false,
		rule: rules.latency
	});
});

test('zero baselines preserve metric direction', () => {
	assert.equal(
		compareBenchmarkMetrics({ throughput: -1, latency: 1 }, { throughput: 0, latency: 0 }, rules)
			.regressions.length,
		2
	);
});
