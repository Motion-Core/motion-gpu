import { performance } from 'node:perf_hooks';
import process from 'node:process';
import {
	createComputeExternalResolutionState,
	resolveComputePassResources,
	type ComputeResourceResolverContext,
	type ComputeResourceResolverLimits
} from '../../src/lib/core/compute-resources';
import {
	createComputePassResourceResolutionCache,
	type ComputeResourceResolutionStats
} from '../../src/lib/core/renderer/compute-resource-resolution';
import { ComputePass } from '../../src/lib/passes/ComputePass';
import { median } from './statistics';
import {
	COMPUTE_TOPOLOGY_SCENARIOS,
	type ComputeTopologyArm,
	type ComputeTopologyScenario,
	type ComputeTopologyWorkerResult
} from './compute-topology-paired-contract';

const WARMUP_MS = 180;
const SAMPLE_COUNT = 12;
const TARGET_SAMPLE_MS = 18;
const COMPUTE =
	'@compute @workgroup_size(1) fn compute(@builtin(global_invocation_id) id: vec3u) { _ = id; }';
const limits: ComputeResourceResolverLimits = {
	maxBindingsPerBindGroup: 512,
	maxSampledTexturesPerShaderStage: 512,
	maxSamplersPerShaderStage: 512,
	maxStorageTexturesPerShaderStage: 512,
	maxStorageBuffersPerShaderStage: 512,
	maxStorageBufferBindingSize: 1 << 20
};
const zeroAllocations =
	(): ComputeTopologyWorkerResult['results']['0']['steadyStateAllocationDelta'] => ({
		planBuilds: 0,
		entriesAllocated: 0,
		readsAllocated: 0,
		writesAllocated: 0,
		layoutEntriesAllocated: 0,
		topologyKeysAllocated: 0
	});

function parseArm(): ComputeTopologyArm {
	const value = process.argv.find((argument) => argument.startsWith('--arm='))?.slice(6);
	if (value !== 'legacy' && value !== 'cached') throw new Error(`Invalid --arm=${String(value)}`);
	return value;
}

function parseSeed(): number {
	const raw = process.argv.find((argument) => argument.startsWith('--seed='))?.slice(7);
	const value = raw === undefined ? 1 : Number(raw);
	if (!Number.isInteger(value)) throw new Error(`Invalid --seed=${String(raw)}`);
	return value;
}

function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

function shuffledScenarios(seed: number): ComputeTopologyScenario[] {
	const result = [...COMPUTE_TOPOLOGY_SCENARIOS];
	const next = random(seed);
	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = Math.floor(next() * (index + 1));
		[result[index], result[target]] = [result[target]!, result[index]!];
	}
	return result;
}

function buffer(label: string): GPUBuffer {
	return { label, size: 256, usage: 128 } as unknown as GPUBuffer;
}

function buildPasses(passCount: number): ComputePass[] {
	return Array.from({ length: passCount }, (_, passIndex) => {
		const resources = Object.fromEntries(
			Array.from({ length: 4 }, (_, resourceIndex) => {
				const alias = `resource${resourceIndex}`;
				return [
					alias,
					{
						buffer: {
							externalBuffer: buffer(`p${passIndex}r${resourceIndex}`),
							resourceId: `p${passIndex}r${resourceIndex}`,
							wgslType: 'array<f32>' as const,
							size: 256,
							usage: 128
						},
						access: 'storage-read' as const
					}
				];
			})
		);
		return new ComputePass({ compute: COMPUTE, resources });
	});
}

function createContext(): Omit<ComputeResourceResolverContext, 'externalState'> {
	return {
		passLabel: 'compute topology benchmark',
		deviceFeatures: new Set(),
		limits,
		externalContext: {
			device: {} as GPUDevice,
			width: 1920,
			height: 1080,
			time: 1,
			delta: 1 / 60
		},
		getMaterialTexture: () => undefined,
		getMaterialStorageBuffer: () => undefined,
		getMaterialSampler: () => undefined
	};
}

function statsDelta(
	before: ComputeResourceResolutionStats,
	after: ComputeResourceResolutionStats
): ComputeTopologyWorkerResult['results']['0']['steadyStateAllocationDelta'] {
	return {
		planBuilds: after.planBuilds - before.planBuilds,
		entriesAllocated: after.entriesAllocated - before.entriesAllocated,
		readsAllocated: after.readsAllocated - before.readsAllocated,
		writesAllocated: after.writesAllocated - before.writesAllocated,
		layoutEntriesAllocated: after.layoutEntriesAllocated - before.layoutEntriesAllocated,
		topologyKeysAllocated: after.topologyKeysAllocated - before.topologyKeysAllocated
	};
}

function runScenario(
	arm: ComputeTopologyArm,
	passCount: ComputeTopologyScenario
): ComputeTopologyWorkerResult['results']['0'] {
	const passes = buildPasses(passCount);
	const context = createContext();
	const cache = createComputePassResourceResolutionCache();
	const expectedPerFrame = 1 + passCount * 8;
	const runFrame = (): number => {
		let checksum = 1;
		if (arm === 'legacy') {
			const externalState = createComputeExternalResolutionState();
			for (const pass of passes) {
				const resources = resolveComputePassResources(pass.getResources(), {
					...context,
					externalState
				});
				checksum += resources.entries.length + resources.reads.length + resources.writes.length;
			}
		} else {
			if (passes.length > 0) cache.beginFrame();
			for (const pass of passes) {
				const resources = cache.resolve({ pass, context, pingPong: false });
				checksum += resources.entries.length + resources.reads.length + resources.writes.length;
			}
		}
		return checksum;
	};

	const warmupUntil = performance.now() + WARMUP_MS;
	while (performance.now() < warmupUntil) runFrame();
	let batchSize = 1;
	while (batchSize < 1 << 22) {
		const startedAt = performance.now();
		for (let index = 0; index < batchSize; index += 1) runFrame();
		if (performance.now() - startedAt >= TARGET_SAMPLE_MS) break;
		batchSize *= 2;
	}
	const statsBefore = cache.getStats();
	let checksum = 0;
	const rawSamples = Array.from({ length: SAMPLE_COUNT }, () => {
		const startedAt = performance.now();
		for (let index = 0; index < batchSize; index += 1) checksum += runFrame();
		const elapsedSeconds = Math.max(0.000001, (performance.now() - startedAt) / 1_000);
		return batchSize / elapsedSeconds;
	});
	const expectedChecksum = expectedPerFrame * batchSize * SAMPLE_COUNT;
	if (checksum !== expectedChecksum) {
		throw new Error(
			`${arm}/${passCount} checksum mismatch: expected ${expectedChecksum}, received ${checksum}`
		);
	}
	return {
		throughputHz: median(rawSamples),
		rawSamples,
		checksum,
		expectedChecksum,
		steadyStateAllocationDelta:
			arm === 'cached' ? statsDelta(statsBefore, cache.getStats()) : zeroAllocations()
	};
}

const arm = parseArm();
const scenarioOrder = shuffledScenarios(parseSeed());
const results = Object.fromEntries(
	scenarioOrder.map((scenario) => [String(scenario), runScenario(arm, scenario)])
) as ComputeTopologyWorkerResult['results'];
const output: ComputeTopologyWorkerResult = { node: process.version, arm, scenarioOrder, results };
process.stdout.write(`${JSON.stringify(output)}\n`);
