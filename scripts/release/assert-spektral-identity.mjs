import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGACY_IDENTITY_PATTERN = /@motion-core\/motion-gpu|motion[ _-]?gpu/gi;
const LEGACY_IDENTITY_PATH_PATTERN = /motion[_-]?gpu/i;

const FULL_HISTORY_ALLOWLIST = new Set([
	'CHANGELOG.md',
	'apps/web/src/lib/content/docs/changelog.svx',
	'packages/spektral/scripts/consumers/packed-consumers.test.mjs',
	'scripts/release/assert-spektral-identity.mjs',
	'scripts/release/assert-spektral-identity.test.mjs',
	'scripts/release/changelog-contract.test.mjs',
	'scripts/release/release-contract.mjs',
	'scripts/release/release-contract.test.mjs',
	'scripts/release/release-workflow.test.mjs'
]);

const HISTORICAL_PATH_PREFIXES = [
	'packages/spektral/benchmarks/baselines/',
	'packages/spektral/benchmarks/core-paired-ab-evidence.md'
];

const REDIRECT_ALLOWLIST = new Set([
	'apps/web/src/hooks.server.ts',
	'apps/web/src/hooks.server.test.ts',
	'apps/web/wrangler.jsonc'
]);

const GENERATED_PATH_SEGMENTS = [
	'/coverage/',
	'/dist/',
	'/node_modules/',
	'/.svelte-kit/',
	'/test-results/',
	'/benchmarks/results/'
];

function lineAndColumn(source, offset) {
	const before = source.slice(0, offset);
	const lines = before.split('\n');
	return { line: lines.length, column: lines.at(-1).length + 1 };
}

function stripApprovedRedirectHosts(source) {
	return source.replaceAll('preview.motion-gpu.dev', '').replaceAll('motion-gpu.dev', '');
}

export function scanSpektralIdentity(relativePath, source) {
	const normalizedPath = relativePath.split(path.sep).join('/');
	if (
		FULL_HISTORY_ALLOWLIST.has(normalizedPath) ||
		HISTORICAL_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
	) {
		return [];
	}

	const searchable = REDIRECT_ALLOWLIST.has(normalizedPath)
		? stripApprovedRedirectHosts(source)
		: source;
	const pathMatch = normalizedPath.match(LEGACY_IDENTITY_PATH_PATTERN);
	const findings = pathMatch
		? [{ path: normalizedPath, token: pathMatch[0], line: 0, column: 0 }]
		: [];
	for (const match of searchable.matchAll(LEGACY_IDENTITY_PATTERN)) {
		const location = lineAndColumn(searchable, match.index ?? 0);
		findings.push({ path: normalizedPath, token: match[0], ...location });
	}
	return findings;
}

export function listRepositoryTextFiles(repositoryRoot) {
	const output = execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
		{ cwd: repositoryRoot, encoding: 'utf8' }
	);
	return output
		.split('\0')
		.filter(Boolean)
		.filter(
			(relativePath) => !GENERATED_PATH_SEGMENTS.some((part) => `/${relativePath}`.includes(part))
		)
		.filter((relativePath) => {
			const absolutePath = path.join(repositoryRoot, relativePath);
			return existsSync(absolutePath) && statSync(absolutePath).isFile();
		});
}

export function assertSpektralIdentity(repositoryRoot) {
	const findings = [];
	for (const relativePath of listRepositoryTextFiles(repositoryRoot)) {
		const absolutePath = path.join(repositoryRoot, relativePath);
		const buffer = readFileSync(absolutePath);
		if (buffer.includes(0)) continue;
		findings.push(...scanSpektralIdentity(relativePath, buffer.toString('utf8')));
	}

	if (findings.length > 0) {
		const details = findings
			.map(
				({ path: findingPath, line, column, token }) =>
					`${findingPath}:${line}:${column} contains legacy identity ${JSON.stringify(token)}`
			)
			.join('\n');
		throw new Error(
			`Spektral identity check failed with ${findings.length} finding(s):\n${details}`
		);
	}
	return { filesChecked: listRepositoryTextFiles(repositoryRoot).length };
}

const isDirectRun =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
	const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
	const result = assertSpektralIdentity(repositoryRoot);
	console.log(`Spektral identity check passed for ${result.filesChecked} repository files.`);
}
