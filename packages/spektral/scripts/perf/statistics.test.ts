import assert from 'node:assert/strict';
import test from 'node:test';
import {
	bootstrapMedianConfidenceInterval,
	bootstrapMedianRelativeChangeConfidenceInterval,
	computeIndependentRunStats,
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

test('bootstrap relative change interval compares independent medians', () => {
	const interval = bootstrapMedianRelativeChangeConfidenceInterval(
		[100, 101, 102, 103, 104],
		[90, 91, 92, 93, 94],
		{ iterations: 1_000, seed: 123 }
	);
	assert.ok(interval.lower < -8);
	assert.ok(interval.upper < 0);
	assert.deepEqual(
		interval,
		bootstrapMedianRelativeChangeConfidenceInterval(
			[100, 101, 102, 103, 104],
			[90, 91, 92, 93, 94],
			{ iterations: 1_000, seed: 123 }
		)
	);
});

test('invalid samples fail explicitly', () => {
	assert.throws(() => computeRobustStats([]), /at least one finite sample/u);
	assert.throws(() => median([Number.NaN]), /at least one finite sample/u);
	assert.throws(() => bootstrapMedianRelativeChangeConfidenceInterval([0], [1]));
});

test('independent-run stats retain raw samples and summarize run medians', () => {
	const stats = computeIndependentRunStats([
		[1, 3],
		[10, 20]
	]);
	assert.deepEqual(stats.rawSamples, [
		[1, 3],
		[10, 20]
	]);
	assert.equal(stats.pooled.median, 6.5);
	assert.equal(stats.runMedians.median, 8.5);
});

test('independent-run stats reject missing and empty runs', () => {
	assert.throws(() => computeIndependentRunStats([]), /at least one run/u);
	assert.throws(() => computeIndependentRunStats([[1], []]), /at least one finite sample/u);
});
