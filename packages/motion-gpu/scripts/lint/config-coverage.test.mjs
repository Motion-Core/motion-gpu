import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { assertConfiguredFile } from './config-coverage.mjs';

test('the sentinel rejects an unconfigured production-like extension', async () => {
	const eslint = new ESLint({ cwd: process.cwd() });

	await assert.rejects(
		assertConfiguredFile(
			eslint,
			{
				file: 'src/lib/core/unconfigured.motiongpu',
				parser: 'typescript-eslint/parser',
				rules: ['@typescript-eslint/no-unused-vars']
			},
			{ requireFile: false }
		),
		/has no matching ESLint configuration/
	);
});
