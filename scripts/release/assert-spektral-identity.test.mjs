import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanSpektralIdentity } from './assert-spektral-identity.mjs';

test('rejects every spelling of the previous active identity', () => {
	const findings = scanSpektralIdentity(
		'src/example.ts',
		[
			'@motion-core/motion-gpu',
			'Motion GPU',
			'MotionGPUContext',
			'motiongpuFrame',
			'motion-gpu.css',
			'MOTION_GPU_DEBUG',
			'MOTIONGPU_CONTEXT',
			'MotionGpuMarker'
		].join('\n')
	);
	assert.deepEqual(
		findings.map(({ token }) => token),
		[
			'@motion-core/motion-gpu',
			'Motion GPU',
			'MotionGPU',
			'motiongpu',
			'motion-gpu',
			'MOTION_GPU',
			'MOTIONGPU',
			'MotionGpu'
		]
	);
});

test('rejects the previous identity in active file and directory names', () => {
	const [finding] = scanSpektralIdentity('src/motion-gpu/MotionGPUContext.ts', 'export {};');
	assert.deepEqual(finding, {
		path: 'src/motion-gpu/MotionGPUContext.ts',
		token: 'motion-gpu',
		line: 0,
		column: 0
	});
});

test('allows only exact legacy redirect hosts in redirect files', () => {
	assert.deepEqual(
		scanSpektralIdentity(
			'apps/web/src/hooks.server.ts',
			"const hosts = ['motion-gpu.dev', 'preview.motion-gpu.dev'];"
		),
		[]
	);
	assert.equal(
		scanSpektralIdentity('apps/web/src/hooks.server.ts', 'const value = "MotionGPU";').length,
		1
	);
	assert.equal(scanSpektralIdentity('apps/web/src/lib/config/site.ts', 'motion-gpu.dev').length, 1);
});

test('allows historical changelog and immutable benchmark evidence', () => {
	assert.deepEqual(scanSpektralIdentity('CHANGELOG.md', 'Motion GPU 0.16.0'), []);
	assert.deepEqual(
		scanSpektralIdentity('packages/spektral/benchmarks/baselines/core.json', 'packages/motion-gpu'),
		[]
	);
});
