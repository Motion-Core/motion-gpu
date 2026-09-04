import assert from 'node:assert/strict';
import test from 'node:test';
import {
	assertComputeTopologyVerdicts,
	compareComputeTopologyScenario,
	validateComputeTopologyWorkerResult,
	type ComputeTopologyWorkerResult
} from './compute-topology-paired-contract';

function workerResult(): ComputeTopologyWorkerResult {
	const scenario = (throughputHz: number) => ({
		throughputHz,
		rawSamples: [throughputHz, throughputHz, throughputHz, throughputHz, throughputHz],
		checksum: 10,
		expectedChecksum: 10,
		steadyStateAllocationDelta: {
			planBuilds: 0,
			entriesAllocated: 0,
			readsAllocated: 0,
			writesAllocated: 0,
			layoutEntriesAllocated: 0,
			topologyKeysAllocated: 0
		}
	});
	return {
		node: 'v22.21.1',
		arm: 'cached',
		scenarioOrder: [0, 4, 16, 32],
		results: { '0': scenario(1), '4': scenario(2), '16': scenario(3), '32': scenario(4) }
	};
}

test('validates raw samples, checksums and zero steady-state topology churn', () => {
	validateComputeTopologyWorkerResult(workerResult());
	const valid = workerResult();
	const invalid: ComputeTopologyWorkerResult = {
		...valid,
		results: {
			...valid.results,
			'16': {
				...valid.results['16'],
				steadyStateAllocationDelta: {
					...valid.results['16'].steadyStateAllocationDelta,
					topologyKeysAllocated: 1
				}
			}
		}
	};
	assert.throws(
		() => validateComputeTopologyWorkerResult(invalid),
		/allocated topology descriptors/
	);
});

test('requires 2x at 32 passes and combines pct, absolute, noise and CI for small regressions', () => {
	const comparison32 = compareComputeTopologyScenario({
		legacy: [100, 101, 99, 100, 100],
		cached: [220, 221, 219, 220, 220],
		scenario: 32,
		seed: 1
	});
	assert.equal(comparison32.verdict, 'speedup-confirmed');
	assert.ok(comparison32.medianRatio >= 2);

	const comparison4 = compareComputeTopologyScenario({
		legacy: [1_000_000, 1_010_000, 990_000, 1_000_000, 1_000_000],
		cached: [995_000, 1_005_000, 985_000, 995_000, 995_000],
		scenario: 4,
		seed: 2
	});
	assert.equal(comparison4.verdict, 'no-significant-regression');
	assert.doesNotThrow(() =>
		assertComputeTopologyVerdicts({
			'0': comparison4,
			'4': comparison4,
			'16': comparison4,
			'32': comparison32
		})
	);
});
