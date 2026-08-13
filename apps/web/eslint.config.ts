import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import path from 'node:path';
import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from 'eslint/config';
import { defineConfig } from 'eslint/config';
import {
	createSharedBaseLanguageConfig,
	createSharedPrettierConfigs,
	createSharedRecommendedConfigs,
	createSharedSvelteLanguageConfig,
	createSharedSvelteRecommendedConfigs
} from '../../scripts/eslint/shared-preset.mjs';
import svelteConfig from './svelte.config';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');
const lintSvelteConfig = {
	...svelteConfig,
	kit: svelteConfig.kit
		? {
				...svelteConfig.kit,
				typescript: undefined
			}
		: undefined
};

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	createSharedRecommendedConfigs({
		js,
		typescriptConfigs: [ts.configs.strictTypeChecked, ts.configs.stylisticTypeChecked]
	}),
	createSharedSvelteRecommendedConfigs({ svelte }),
	createSharedPrettierConfigs({ prettier, svelte }),
	createSharedBaseLanguageConfig({
		globals,
		projectService: true,
		tsconfigRootDir: import.meta.dirname
	}),
	createSharedSvelteLanguageConfig({
		svelteConfig: lintSvelteConfig,
		ts,
		tsconfigRootDir: import.meta.dirname
	}),
	{
		...ts.configs.disableTypeChecked,
		files: ['scripts/**/*.mjs']
	},
	{
		ignores: [
			'src/lib/playground-engine/**',
			'src/playground-demo-shims.d.ts',
			'src/routes/playground/demos/**',
			'src/routes/playground/runtime-template/**'
		]
	},
	{
		...ts.configs.disableTypeChecked,
		files: ['src/routes/playground/**'],
		rules: {
			...ts.configs.disableTypeChecked.rules,
			'@typescript-eslint/array-type': 'off',
			'@typescript-eslint/consistent-indexed-object-style': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/prefer-for-of': 'off',
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/consistent-type-definitions': ['warn', 'type']
		}
	}
);
