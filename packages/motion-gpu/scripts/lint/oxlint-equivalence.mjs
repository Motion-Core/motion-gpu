import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const mutationFixture = 'scripts/lint/fixtures/oxlint-promise-safety.ts';
const mutationConfig = 'scripts/lint/oxlint-mutation.config.json';

export const oxlintPromiseRules = [
	'typescript/await-thenable',
	'typescript/no-floating-promises',
	'typescript/no-misused-promises'
];

export const oxlintPromiseArguments = [
	'--type-aware',
	'-A',
	'all',
	...oxlintPromiseRules.flatMap((rule) => ['-D', rule])
];

function triggeredRules(diagnostics) {
	return new Set(
		diagnostics.map(({ code, ruleId }) => (code ?? ruleId)?.replace(/^([^()]+)\((.+)\)$/, '$1/$2'))
	);
}

export function assertCorrectnessMutationDiagnostics(diagnostics) {
	assert.ok(
		triggeredRules(diagnostics).has('eslint/no-debugger'),
		'Oxlint correctness mutation did not trigger eslint/no-debugger.'
	);
}

export function assertPromiseMutationDiagnostics(diagnostics) {
	const rules = triggeredRules(diagnostics);

	for (const rule of oxlintPromiseRules) {
		assert.ok(rules.has(rule), `Oxlint promise mutation did not trigger ${rule}.`);
	}
}

async function lintMutation(arguments_) {
	let stdout;

	try {
		await execFileAsync(
			'pnpm',
			[
				'exec',
				'oxlint',
				...arguments_,
				'--config',
				mutationConfig,
				'--no-ignore',
				'--format',
				'json',
				mutationFixture
			],
			{ cwd: packageRoot }
		);
		throw new Error('Oxlint mutation unexpectedly passed.');
	} catch (error) {
		if (!error || typeof error !== 'object' || !('stdout' in error)) {
			throw error;
		}
		stdout = String(error.stdout);
	}

	const report = JSON.parse(stdout);
	return report.diagnostics;
}

export async function runOxlintEquivalenceCheck() {
	assertCorrectnessMutationDiagnostics(await lintMutation([]));
	assertPromiseMutationDiagnostics(await lintMutation(oxlintPromiseArguments));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runOxlintEquivalenceCheck();
	console.log('Oxlint promise-safety mutation coverage passed.');
}
