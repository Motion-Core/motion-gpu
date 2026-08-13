import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { defineMaterial, resolveMaterial } from '../../src/lib/core/material';
import { findDirtyFloatRanges } from '../../src/lib/core/renderer';

const WARMUP_MS = 400;
const SAMPLE_COUNT = 24;

interface CaseResult {
	meanHz: number;
	samples: number[];
	checksum: number;
}

function runCase(batchSize: number, expectedValue: number, fn: () => number): CaseResult {
	const warmupUntil = performance.now() + WARMUP_MS;
	while (performance.now() < warmupUntil) {
		fn();
	}
	let checksum = 0;
	const samples = Array.from({ length: SAMPLE_COUNT }, () => {
		const startedAt = performance.now();
		for (let index = 0; index < batchSize; index += 1) {
			checksum += fn();
		}
		const elapsedSec = Math.max(0.000001, (performance.now() - startedAt) / 1_000);
		return batchSize / elapsedSec;
	});
	const expectedChecksum = expectedValue * batchSize * SAMPLE_COUNT;
	if (checksum !== expectedChecksum) {
		throw new Error(
			`Benchmark operation checksum mismatch: expected ${expectedChecksum}, received ${checksum}`
		);
	}
	return {
		meanHz: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
		samples,
		checksum
	};
}

const cachedMaterial = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv, 0.5, 1.0);
}
`,
	uniforms: {
		time: 0,
		amplitude: [1, 0.5, 0.25, 1] as [number, number, number, number]
	}
});
const resolvedMaterial = resolveMaterial(cachedMaterial);

const previous = new Float32Array(256).fill(1);
const next = new Float32Array(256).fill(1);
const cached = runCase(10_000, 1, () =>
	resolveMaterial(cachedMaterial) === resolvedMaterial ? 1 : 0
);
const clean = runCase(200_000, 1, () =>
	findDirtyFloatRanges(previous, next).length === 0 ? 1 : 0
);

console.log(
	JSON.stringify({
		node: process.version,
		metrics: {
			resolve_material_cached_hz: cached.meanHz,
			find_dirty_ranges_clean_frame_hz: clean.meanHz
		},
		withinProcessSamples: {
			resolve_material_cached_hz: cached.samples,
			find_dirty_ranges_clean_frame_hz: clean.samples
		}
	})
);
