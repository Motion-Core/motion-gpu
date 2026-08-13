import assert from 'node:assert/strict';
import test from 'node:test';
import {
	bootstrapMedianConfidenceInterval,
	computeRobustStats,
	median,
	quantile
} from './statistics';

test('quantiles interpolate and median handles odd and even samples', () => {
	assert.equal(quantile([0, 10], 0.25), 2.5);
	assert.equal(median([3, 1, 2]), 2);
	assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('robust stats report the slow tail as p5 throughput', () => {
	const stats = computeRobustStats([90, 100, 100, 100, 110]);
	assert.equal(stats.median, 100);
	assert.equal(stats.mad, 0);
	assert.equal(stats.p5, 92);
	assert.equal(stats.p95, 108);
	assert.equal(stats.min, 90);
	assert.equal(stats.max, 110);
	assert.ok(stats.bootstrapMedianCi.lower <= 100);
	assert.ok(stats.bootstrapMedianCi.upper >= 100);
});

test('bootstrap interval is deterministic for a seed', () => {
	const options = { iterations: 200, seed: 42 };
	assert.deepEqual(
		bootstrapMedianConfidenceInterval([1, 2, 3, 4, 5], options),
		bootstrapMedianConfidenceInterval([1, 2, 3, 4, 5], options)
	);
});

test('invalid samples fail explicitly', () => {
	assert.throws(() => computeRobustStats([]), /at least one finite sample/u);
	assert.throws(() => median([Number.NaN]), /at least one finite sample/u);
});
