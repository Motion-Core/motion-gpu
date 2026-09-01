import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const BENCHMARK_SCHEMA_VERSION = 3 as const;

export interface BrowserIdentity {
	channel: string;
	version: string;
	engine: string;
}

export interface AdapterIdentity {
	vendor: string;
	architecture: string;
	device: string;
	description: string;
	backend: string;
	type: string;
	driver: string;
	isFallbackAdapter: boolean;
}

export interface BenchmarkEnvironment {
	commitSha: string;
	dirty: boolean;
	node: string;
	v8: string;
	pnpm: string;
	platform: NodeJS.Platform;
	arch: string;
	osRelease: string;
	cpu: string;
	powerMode: string;
	browser: BrowserIdentity | null;
	adapter: AdapterIdentity | null;
	suiteHash: string;
}

export interface EnvironmentOverrides {
	browser?: BrowserIdentity | null;
	adapter?: AdapterIdentity | null;
}

export interface EnvironmentCompatibility {
	compatible: boolean;
	differences: string[];
}

export interface HardwareBenchmarkIdentity {
	platform: NodeJS.Platform;
	arch: string;
	osRelease: string;
	cpu: string;
	powerMode: string;
	browser: {
		channel: string;
		engine: string;
		majorVersion: string;
	} | null;
	adapter: AdapterIdentity | null;
	suiteHash: string;
}

export function gitSubprocessEnvironment(): NodeJS.ProcessEnv {
	const environment = { ...process.env };
	for (const name of Object.keys(environment)) {
		if (name.startsWith('GIT_')) {
			delete environment[name];
		}
	}
	return environment;
}

async function commandOutput(
	command: string,
	args: string[],
	cwd: string,
	env?: NodeJS.ProcessEnv
): Promise<string> {
	const { stdout } = await execFileAsync(command, args, {
		cwd,
		env,
		encoding: 'utf8'
	});
	return stdout.trim();
}

async function gitIdentity(repositoryRoot: string): Promise<{ commitSha: string; dirty: boolean }> {
	const environment = gitSubprocessEnvironment();
	const [commitSha, status] = await Promise.all([
		commandOutput('git', ['rev-parse', 'HEAD'], repositoryRoot, environment),
		commandOutput(
			'git',
			['status', '--porcelain', '--untracked-files=normal'],
			repositoryRoot,
			environment
		)
	]);
	return { commitSha, dirty: status.length > 0 };
}

async function pnpmVersion(repositoryRoot: string): Promise<string> {
	const userAgent = process.env['npm_config_user_agent'];
	const fromAgent = /(?:^|\s)pnpm\/([^\s]+)/u.exec(userAgent ?? '')?.[1];
	if (fromAgent) {
		return fromAgent;
	}
	return commandOutput('pnpm', ['--version'], repositoryRoot);
}

export async function hashSuiteFiles(paths: readonly string[], root?: string): Promise<string> {
	const hash = createHash('sha256');
	for (const path of [...paths].sort()) {
		hash.update(root ? relative(root, path) : path);
		hash.update('\0');
		hash.update(await readFile(path));
		hash.update('\0');
	}
	return hash.digest('hex');
}

export async function collectBenchmarkEnvironment(input: {
	repositoryRoot: string;
	suiteFiles: readonly string[];
	overrides?: EnvironmentOverrides;
}): Promise<BenchmarkEnvironment> {
	const repositoryRoot = resolve(input.repositoryRoot);
	const [{ commitSha, dirty }, pnpm, suiteHash] = await Promise.all([
		gitIdentity(repositoryRoot),
		pnpmVersion(repositoryRoot),
		hashSuiteFiles(input.suiteFiles, repositoryRoot)
	]);

	return {
		commitSha,
		dirty,
		node: process.version,
		v8: process.versions.v8,
		pnpm,
		platform: platform(),
		arch: arch(),
		osRelease: release(),
		cpu: cpus()[0]?.model ?? 'unknown',
		powerMode: process.env['SPEKTRAL_PERF_POWER_MODE'] ?? 'uncontrolled',
		browser: input.overrides?.browser ?? null,
		adapter: input.overrides?.adapter ?? null,
		suiteHash
	};
}

function stableIdentity(value: unknown): string {
	return JSON.stringify(value);
}

export function browserMajorVersion(version: string): string {
	return version.split('.')[0] ?? version;
}

export function hardwareBenchmarkIdentity(
	environment: BenchmarkEnvironment
): HardwareBenchmarkIdentity {
	return {
		platform: environment.platform,
		arch: environment.arch,
		osRelease: environment.osRelease,
		cpu: environment.cpu,
		powerMode: environment.powerMode,
		browser: environment.browser
			? {
					channel: environment.browser.channel,
					engine: environment.browser.engine,
					majorVersion: browserMajorVersion(environment.browser.version)
				}
			: null,
		adapter: environment.adapter,
		suiteHash: environment.suiteHash
	};
}

/** Hardware results may span Chromium patch releases, but not a major or driver change. */
export function compareHardwareBenchmarkEnvironments(
	current: BenchmarkEnvironment,
	baseline: BenchmarkEnvironment
): EnvironmentCompatibility {
	const currentIdentity = hardwareBenchmarkIdentity(current);
	const baselineIdentity = hardwareBenchmarkIdentity(baseline);
	const identityFields = Object.keys(currentIdentity) as (keyof HardwareBenchmarkIdentity)[];
	const differences = identityFields
		.filter(
			(field) => stableIdentity(currentIdentity[field]) !== stableIdentity(baselineIdentity[field])
		)
		.map(
			(field) =>
				`${field}: current=${stableIdentity(currentIdentity[field])} baseline=${stableIdentity(baselineIdentity[field])}`
		);
	return { compatible: differences.length === 0, differences };
}

export function compareBenchmarkEnvironments(
	current: BenchmarkEnvironment,
	baseline: BenchmarkEnvironment
): EnvironmentCompatibility {
	const identityFields = [
		'node',
		'v8',
		'pnpm',
		'platform',
		'arch',
		'osRelease',
		'cpu',
		'powerMode',
		'browser',
		'adapter',
		'suiteHash'
	] as const satisfies readonly (keyof BenchmarkEnvironment)[];
	const differences = identityFields
		.filter((field) => stableIdentity(current[field]) !== stableIdentity(baseline[field]))
		.map(
			(field) =>
				`${field}: current=${stableIdentity(current[field])} baseline=${stableIdentity(baseline[field])}`
		);
	return { compatible: differences.length === 0, differences };
}
