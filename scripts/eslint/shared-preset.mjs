const svelteFiles = ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'];

/** @typedef {object} FlatConfig */

/**
 * @param {unknown[]} configs
 * @returns {FlatConfig[]}
 */
function flattenConfigs(configs) {
	return /** @type {FlatConfig[]} */ (configs.flat(Number.POSITIVE_INFINITY));
}

/**
 * Shared JavaScript and TypeScript baseline. Each workspace supplies its
 * deliberate TypeScript strictness level.
 *
 * @param {{ js: { configs: { recommended: FlatConfig } }, typescriptConfigs: unknown[] }} input
 * @returns {FlatConfig[]}
 */
export function createSharedRecommendedConfigs(input) {
	const { js, typescriptConfigs } = input;
	return [js.configs.recommended, ...flattenConfigs(typescriptConfigs)];
}

/**
 * @param {{ svelte: { configs: { recommended: unknown[] } } }} input
 * @returns {FlatConfig[]}
 */
export function createSharedSvelteRecommendedConfigs(input) {
	const { svelte } = input;
	return flattenConfigs(svelte.configs.recommended);
}

/**
 * @param {{ prettier: FlatConfig, svelte: { configs: { prettier: unknown[] } } }} input
 * @returns {FlatConfig[]}
 */
export function createSharedPrettierConfigs(input) {
	const { prettier, svelte } = input;
	return [prettier, ...flattenConfigs(svelte.configs.prettier)];
}

/**
 * Shared globals and TypeScript config root. The app applies project-service
 * type information to every file; the package opts in only on narrower paths.
 *
 * @param {{ globals: { browser: Record<string, boolean>, node: Record<string, boolean> }, projectService?: boolean, tsconfigRootDir: string }} input
 */
export function createSharedBaseLanguageConfig(input) {
	const { globals, projectService = false, tsconfigRootDir } = input;
	return {
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				tsconfigRootDir,
				...(projectService ? { projectService: true } : {})
			}
		},
		rules: {
			// TypeScript's compiler, not ESLint's JavaScript scope analyzer,
			// owns name resolution in both workspaces.
			'no-undef': /** @type {'off'} */ ('off')
		}
	};
}

/**
 * @param {{ svelteConfig: object, ts: { parser: object }, tsconfigRootDir: string }} input
 */
export function createSharedSvelteLanguageConfig(input) {
	const { svelteConfig, ts, tsconfigRootDir } = input;
	return {
		files: svelteFiles,
		languageOptions: {
			parserOptions: {
				tsconfigRootDir,
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	};
}

export const sharedPresetContract = Object.freeze({
	files: Object.freeze([...svelteFiles]),
	intentionalTypeScriptDeviation: Object.freeze({
		'apps/web': 'strictTypeChecked + stylisticTypeChecked',
		'packages/motion-gpu': 'recommended + production promise-safety rules'
	})
});
