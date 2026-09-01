import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { assertConfiguredFile } from './config-coverage.mjs';

test('the web sentinel rejects an unconfigured production-like extension', async () => {
	const eslint = new ESLint({ cwd: process.cwd() });

	await assert.rejects(
		assertConfiguredFile(
			eslint,
			{
				file: 'src/lib/unconfigured.spektral',
				parser: 'typescript-eslint/parser',
				rules: ['no-debugger']
			},
			{ requireFile: false }
		),
		/has no matching ESLint configuration/
	);
});

test('the Svelte config remains serializable for ESLint tooling', async () => {
	const eslint = new ESLint({ cwd: process.cwd() });
	const config = await eslint.calculateConfigForFile('src/routes/+layout.svelte');

	assert.doesNotThrow(() => JSON.stringify(config));
});
