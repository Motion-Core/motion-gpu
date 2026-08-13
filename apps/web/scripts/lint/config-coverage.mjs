import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

export const webLintCoverageExpectations = [
	{
		file: 'src/lib/config/site.ts',
		parser: 'typescript-eslint/parser',
		rules: ['no-debugger', '@typescript-eslint/no-floating-promises']
	},
	{
		file: 'src/routes/+page.svelte',
		parser: 'svelte-eslint-parser',
		rules: ['no-debugger', '@typescript-eslint/no-floating-promises', 'svelte/no-at-debug-tags']
	}
];

function ruleSeverity(ruleConfig) {
	return Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;
}

function isRuleEnabled(ruleConfig) {
	const severity = ruleSeverity(ruleConfig);
	return severity === 1 || severity === 2 || severity === 'warn' || severity === 'error';
}

export async function assertConfiguredFile(eslint, expectation, { requireFile = true } = {}) {
	if (requireFile) {
		await access(new URL(`../../${expectation.file}`, import.meta.url));
	}

	const config = await eslint.calculateConfigForFile(expectation.file);
	if (!config) {
		throw new Error(`${expectation.file} has no matching ESLint configuration.`);
	}

	const parserName = config.languageOptions.parser?.meta?.name;
	if (parserName !== expectation.parser) {
		throw new Error(
			`${expectation.file} uses ${parserName ?? 'no parser'}; expected ${expectation.parser}.`
		);
	}

	for (const rule of expectation.rules) {
		if (!isRuleEnabled(config.rules[rule])) {
			throw new Error(`${expectation.file} does not enable required rule ${rule}.`);
		}
	}
}

async function assertMutationCoverage(eslint) {
	const typedSource = `async function run(): Promise<void> {
	debugger;
}

run();`;
	const [typedResult] = await eslint.lintText(typedSource, { filePath: 'src/lib/config/site.ts' });
	const typedRules = new Set(typedResult.messages.map(({ ruleId }) => ruleId));

	for (const rule of ['no-debugger', '@typescript-eslint/no-floating-promises']) {
		if (!typedRules.has(rule)) {
			throw new Error(`Web TypeScript lint mutation did not trigger ${rule}.`);
		}
	}

	const svelteSource = `<script lang="ts">
	const value = 1;
</script>

{@debug value}`;
	const [svelteResult] = await eslint.lintText(svelteSource, {
		filePath: 'src/routes/+page.svelte'
	});
	const svelteRules = new Set(svelteResult.messages.map(({ ruleId }) => ruleId));

	if (!svelteRules.has('svelte/no-at-debug-tags')) {
		throw new Error('Web Svelte lint mutation did not trigger svelte/no-at-debug-tags.');
	}
}

export async function runWebLintConfigChecks() {
	const eslint = new ESLint({ cwd: appRoot });

	for (const expectation of webLintCoverageExpectations) {
		await assertConfiguredFile(eslint, expectation);
	}
	await assertMutationCoverage(eslint);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runWebLintConfigChecks();
	console.log('Web lint config coverage and mutation checks passed.');
}
