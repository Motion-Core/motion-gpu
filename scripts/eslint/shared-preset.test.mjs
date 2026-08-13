import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createSharedBaseLanguageConfig,
	createSharedPrettierConfigs,
	createSharedRecommendedConfigs,
	createSharedSvelteLanguageConfig,
	createSharedSvelteRecommendedConfigs,
	sharedPresetContract
} from './shared-preset.mjs';

test('recommended and formatting configs preserve their declared order', () => {
	const js = { configs: { recommended: 'js' } };
	const svelte = { configs: { prettier: [['svelte-prettier']], recommended: [['svelte']] } };

	assert.deepEqual(
		createSharedRecommendedConfigs({
			js,
			typescriptConfigs: [['typescript-strict'], ['typescript-style']]
		}),
		['js', 'typescript-strict', 'typescript-style']
	);
	assert.deepEqual(createSharedSvelteRecommendedConfigs({ svelte }), ['svelte']);
	assert.deepEqual(createSharedPrettierConfigs({ prettier: 'prettier', svelte }), [
		'prettier',
		'svelte-prettier'
	]);
});

test('language configs require globals and the Svelte TypeScript parser', () => {
	const tsParser = { meta: { name: 'typescript-eslint/parser' } };
	const base = createSharedBaseLanguageConfig({
		globals: { browser: { window: false }, node: { process: false } },
		projectService: true,
		tsconfigRootDir: '/workspace'
	});
	const svelte = createSharedSvelteLanguageConfig({
		svelteConfig: { compilerOptions: {} },
		ts: { parser: tsParser },
		tsconfigRootDir: '/workspace'
	});

	assert.deepEqual(base.languageOptions.globals, { window: false, process: false });
	assert.equal(base.languageOptions.parserOptions.projectService, true);
	assert.equal(base.rules['no-undef'], 'off');
	assert.deepEqual(svelte.files, sharedPresetContract.files);
	assert.equal(svelte.languageOptions.parserOptions.parser, tsParser);
	assert.equal(svelte.languageOptions.parserOptions.projectService, true);
});
