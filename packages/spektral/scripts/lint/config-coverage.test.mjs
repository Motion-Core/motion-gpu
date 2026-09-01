import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { assertConfiguredFile } from './config-coverage.mjs';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

test('the sentinel rejects an unconfigured production-like extension', async () => {
	const eslint = new ESLint({ cwd: packageRoot });

	await assert.rejects(
		assertConfiguredFile(
			eslint,
			{
				file: 'src/lib/core/unconfigured.spektral',
				parser: 'typescript-eslint/parser',
				rules: ['@typescript-eslint/no-unused-vars']
			},
			{ requireFile: false }
		),
		/has no matching ESLint configuration/
	);
});

test('the sentinel rejects a configured file with the wrong parser', async () => {
	const eslint = new ESLint({ cwd: packageRoot });

	await assert.rejects(
		assertConfiguredFile(
			eslint,
			{
				file: 'src/lib/core/renderer.ts',
				parser: 'vue-eslint-parser',
				rules: ['@typescript-eslint/no-unused-vars']
			},
			{ requireFile: false }
		),
		/uses typescript-eslint\/parser; expected vue-eslint-parser/
	);
});

test('the sentinel rejects a configured file with a disabled required rule', async () => {
	const eslint = new ESLint({ cwd: packageRoot });

	await assert.rejects(
		assertConfiguredFile(
			eslint,
			{
				file: 'src/lib/core/renderer.ts',
				parser: 'typescript-eslint/parser',
				rules: ['no-alert']
			},
			{ requireFile: false }
		),
		/does not enable required rule no-alert/
	);
});
