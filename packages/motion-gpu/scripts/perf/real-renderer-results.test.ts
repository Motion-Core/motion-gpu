import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	RealRendererBrowserResult,
	ScenarioResult,
	Stats
} from './browser/real-renderer-benchmark';
import { aggregateScenarios, aggregateStats } from './real-renderer-results';

function stats(samples: number[], median: number): Stats {
	return {
		samples,
		median,
		p95: Math.max(...samples),
		p99: Math.max(...samples),
		min: Math.min(...samples),
		max: Math.max(...samples),
		coefficientOfVariationPct: 0
	};
}

function scenario(checksum: number, offset: number): ScenarioResult {
	return {
		name: 'sixteen-pass',
		passCount: 16,
		cpuSubmitMs: stats([1 + offset, 2 + offset], 1.5 + offset),
		queueCompletionMs: stats([3 + offset, 4 + offset], 3.5 + offset),
		gpuFrameNs: stats([5 + offset, 6 + offset], 5.5 + offset),
		correctness: {
			before: checksum,
			after: checksum,
			pixelCount: 4,
			rgbRangeBefore: 128,
			rgbRangeAfter: 128,
			computeSentinelBefore: null,
			computeSentinelAfter: null
		}
	};
}

function browserResult(result: ScenarioResult): RealRendererBrowserResult {
	return {
		adapter: {
			vendor: 'vendor',
			architecture: 'architecture',
			device: 'device',
			description: 'GPU',
			backend: 'backend',
			type: 'integrated GPU',
			driver: 'driver',
			isFallbackAdapter: false
		},
		features: ['timestamp-query'],
		config: {
			width: 2,
			height: 2,
			crossOriginIsolated: true,
			performanceNowResolutionMs: 0.005,
			warmupFrames: 1,
			sampleFrames: 2,
			cpuSampleBatches: 1,
			cpuFramesPerBatch: 2,
			cpuInterval: 'amortized-renderer.render-call',
			gpuInterval: 'pre-marker-end-to-post-marker-begin',
			completionInterval: 'before-render-to-onSubmittedWorkDone'
		},
		scenarios: [result]
	};
}

test('aggregates raw samples separately from independent run medians', () => {
	const aggregate = aggregateStats([stats([1, 2], 1.5), stats([10, 20], 15)]);
	assert.deepEqual(aggregate.samples, [1, 2, 10, 20]);
	assert.equal(aggregate.median, 6);
	assert.equal(aggregate.runMedians.median, 8.25);
});

test('preserves per-scenario correctness contract across browser runs', () => {
	const [aggregate] = aggregateScenarios([
		browserResult(scenario(123, 0)),
		browserResult(scenario(123, 10))
	]);
	assert.equal(aggregate?.cpuSubmitMs.runMedians.median, 6.5);
	assert.equal(aggregate?.correctness.after, 123);
});

test('rejects browser runs with different output checksums', () => {
	assert.throws(
		() => aggregateScenarios([browserResult(scenario(123, 0)), browserResult(scenario(456, 10))]),
		/browser runs disagreed/iu
	);
});
