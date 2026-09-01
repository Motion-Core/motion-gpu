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
	gitSubprocessEnvironment,
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
	const directory = await mkdtemp(join(tmpdir(), 'spektral-perf-schema-'));
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

test('Git subprocesses do not inherit a parent commit context', () => {
	const previousIndexFile = process.env['GIT_INDEX_FILE'];
	process.env['GIT_INDEX_FILE'] = '/tmp/parent-index';
	try {
		const environment = gitSubprocessEnvironment();
		assert.equal(environment['GIT_INDEX_FILE'], undefined);
		assert.equal(
			Object.keys(environment).some((name) => name.startsWith('GIT_')),
			false
		);
		assert.equal(environment['PATH'], process.env['PATH']);
	} finally {
		if (previousIndexFile === undefined) {
			delete process.env['GIT_INDEX_FILE'];
		} else {
			process.env['GIT_INDEX_FILE'] = previousIndexFile;
		}
	}
});

test('untracked benchmark source makes the environment dirty', async () => {
	const repository = await mkdtemp(join(tmpdir(), 'spektral-perf-git-'));
	const suiteFile = join(repository, 'suite.ts');
	const gitOptions = { cwd: repository, env: gitSubprocessEnvironment() };
	await execFileAsync('git', ['init'], gitOptions);
	await execFileAsync('git', ['config', 'user.email', 'perf@example.invalid'], gitOptions);
	await execFileAsync('git', ['config', 'user.name', 'Perf Test'], gitOptions);
	await writeFile(suiteFile, 'export {};\n');
	await execFileAsync('git', ['add', 'suite.ts'], gitOptions);
	await execFileAsync('git', ['commit', '-m', 'test fixture'], gitOptions);
	await writeFile(join(repository, 'untracked-benchmark.ts'), 'export {};\n');

	const previousUserAgent = process.env['npm_config_user_agent'];
	process.env['npm_config_user_agent'] = 'pnpm/0.0.0-test npm/? node/? test';
	try {
		const result = await collectBenchmarkEnvironment({
			repositoryRoot: repository,
			suiteFiles: [suiteFile]
		});
		assert.equal(result.dirty, true);
	} finally {
		if (previousUserAgent === undefined) {
			delete process.env['npm_config_user_agent'];
		} else {
			process.env['npm_config_user_agent'] = previousUserAgent;
		}
	}
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
