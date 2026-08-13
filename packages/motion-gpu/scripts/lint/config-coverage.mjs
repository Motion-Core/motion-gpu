import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

export const lintCoverageExpectations = [
	{
		file: 'src/lib/core/renderer.ts',
		parser: 'typescript-eslint/parser',
		rules: ['@typescript-eslint/no-unused-vars']
	},
	{
		file: 'src/lib/react/FragCanvas.tsx',
		parser: 'typescript-eslint/parser',
		rules: ['@typescript-eslint/no-unused-vars']
	},
	{
		file: 'src/lib/svelte/FragCanvas.svelte',
		parser: 'svelte-eslint-parser',
		rules: ['svelte/no-at-debug-tags']
	},
	{
		file: 'src/lib/vue/FragCanvas.vue',
		parser: 'vue-eslint-parser',
		rules: ['@typescript-eslint/no-unused-vars', 'vue/no-duplicate-attributes']
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

export async function assertLintConfigCoverage(
	eslint,
	expectations = lintCoverageExpectations,
	options
) {
	for (const expectation of expectations) {
		await assertConfiguredFile(eslint, expectation, options);
	}
}

async function assertVueMutationCoverage(eslint) {
	const source = `<script setup lang="ts">
const unused = 1;
</script>

<template>
	<div id="first" id="second" />
</template>`;
	const [result] = await eslint.lintText(source, {
		filePath: 'src/lib/vue/FragCanvas.vue'
	});
	const ruleIds = new Set(result.messages.map(({ ruleId }) => ruleId));

	for (const expectedRule of ['@typescript-eslint/no-unused-vars', 'vue/no-duplicate-attributes']) {
		if (!ruleIds.has(expectedRule)) {
			throw new Error(`Vue lint mutation did not trigger ${expectedRule}.`);
		}
	}
}

export async function runLintConfigChecks() {
	const eslint = new ESLint({ cwd: packageRoot });
	await assertLintConfigCoverage(eslint);
	await assertVueMutationCoverage(eslint);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runLintConfigChecks();
	console.log('Lint config coverage and Vue mutation checks passed.');
}
