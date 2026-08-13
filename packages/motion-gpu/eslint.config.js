import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '../../.gitignore');
const reactFiles = [
	'src/lib/react/**/*.{ts,tsx}',
	'src/tests/react-*.{ts,tsx}',
	'e2e/harness-react/**/*.{ts,tsx}'
];
const typeAwareProductionFiles = ['src/lib/**/*.{ts,tsx}'];
const vueFiles = ['**/*.vue'];
const vueRecommended = vue.configs['flat/recommended-error'].map((config) => ({
	...config,
	files: vueFiles
}));

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		ignores: ['dist/**', '.svelte-kit/**', 'coverage/**']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	{
		files: typeAwareProductionFiles,
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error'
		}
	},
	...svelte.configs.recommended,
	{
		files: reactFiles,
		plugins: {
			'react-hooks': reactHooks
		},
		rules: {
			'react-hooks/exhaustive-deps': 'error',
			'react-hooks/rules-of-hooks': 'error'
		}
	},
	...vueRecommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname
			}
		}
	},
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'no-undef': 'off'
		}
	},
	{
		files: vueFiles,
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.vue'],
				parser: ts.parser
			}
		},
		rules: {
			// SFC templates mirror the public JavaScript prop names used by all
			// framework adapters, including WebGPU descriptor-style camelCase names.
			'vue/attribute-hyphenation': 'off',
			// Optionality is expressed by the public TypeScript props contract; omission
			// intentionally resolves to undefined rather than a framework-owned default.
			'vue/require-default-prop': 'off',
			'vue/multi-word-component-names': ['error', { ignores: ['Portal'] }]
		}
	},
	{
		files: [
			'e2e/harness-vue/RuntimeProbe.vue',
			'e2e/harness-vue/scenarios/LifecycleProbe.vue',
			'e2e/harness-vue/scenarios/UniformProbe.vue'
		],
		rules: {
			// These instrumentation-only probes intentionally render no DOM of their own.
			'vue/valid-template-root': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
