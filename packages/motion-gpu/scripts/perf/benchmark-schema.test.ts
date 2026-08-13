import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
	collectBenchmarkEnvironment,
	compareBenchmarkEnvironments,
	hashSuiteFiles,
	type BenchmarkEnvironment
} from './benchmark-schema';

const execFileAsync = promisify(execFile);

const environment: BenchmarkEnvironment = {
	commitSha: 'abc',
	dirty: false,
	node: 'v23.11.0',
	v8: '12.0',
	pnpm: '10.24.0',
	platform: 'darwin',
	arch: 'arm64',
	osRelease: '25.5.0',
	cpu: 'Apple M4 Pro',
	powerMode: 'ac-high-power',
	browser: null,
	adapter: null,
	suiteHash: 'suite'
};

test('suite hashes include paths and file contents in stable order', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'motion-gpu-perf-schema-'));
	const a = join(directory, 'a.ts');
	const b = join(directory, 'b.ts');
	await Promise.all([writeFile(a, 'a'), writeFile(b, 'b')]);
	const initialHash = await hashSuiteFiles([a, b]);
	assert.equal(initialHash, await hashSuiteFiles([b, a]));
	await writeFile(b, 'changed');
	assert.notEqual(initialHash, await hashSuiteFiles([b, a]));
});

test('commit and dirty state are evidence, not compatibility dimensions', () => {
	const baseline = { ...environment, commitSha: 'old', dirty: false };
	const current = { ...environment, commitSha: 'new', dirty: true };
	assert.deepEqual(compareBenchmarkEnvironments(current, baseline), {
		compatible: true,
		differences: []
	});
});

test('untracked benchmark source makes the environment dirty', async () => {
	const repository = await mkdtemp(join(tmpdir(), 'motion-gpu-perf-git-'));
	const suiteFile = join(repository, 'suite.ts');
	await execFileAsync('git', ['init'], { cwd: repository });
	await execFileAsync('git', ['config', 'user.email', 'perf@example.invalid'], { cwd: repository });
	await execFileAsync('git', ['config', 'user.name', 'Perf Test'], { cwd: repository });
	await writeFile(suiteFile, 'export {};\n');
	await execFileAsync('git', ['add', 'suite.ts'], { cwd: repository });
	await execFileAsync('git', ['commit', '-m', 'test fixture'], { cwd: repository });
	await writeFile(join(repository, 'untracked-benchmark.ts'), 'export {};\n');

	const result = await collectBenchmarkEnvironment({
		repositoryRoot: repository,
		suiteFiles: [suiteFile]
	});
	assert.equal(result.dirty, true);
});

test('runtime, hardware and suite differences reject comparisons', () => {
	const current = {
		...environment,
		node: 'v24.0.0',
		suiteHash: 'changed',
		browser: { channel: 'chromium', version: '151.0.0', engine: 'Chromium' }
	};
	const comparison = compareBenchmarkEnvironments(current, environment);
	assert.equal(comparison.compatible, false);
	assert.deepEqual(
		comparison.differences.map((entry) => entry.split(':')[0]),
		['node', 'browser', 'suiteHash']
	);
});
