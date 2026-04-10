import * as Babel from '@babel/standalone';
import { VIRTUAL } from '../../constants';
import { fetch_package, resolve_version } from '../../npm';
import type { Plugin } from '@rollup/browser';

type VueCompiler = {
	parse: (
		source: string,
		options: { filename: string; sourceMap?: boolean }
	) => {
		descriptor: {
			script?: { src?: string };
			scriptSetup?: { src?: string };
			template?: { src?: string; content: string };
			styles: Array<{ src?: string; content: string; scoped?: boolean }>;
		};
		errors: unknown[];
	};
	compileScript: (
		descriptor: unknown,
		options: { id: string; genDefaultAs: string; inlineTemplate: boolean }
	) => {
		content: string;
		bindings?: Record<string, unknown>;
	};
	compileTemplate: (options: {
		id: string;
		source: string;
		filename: string;
		scoped: boolean;
		isProd: boolean;
		compilerOptions?: Record<string, unknown>;
	}) => {
		code: string;
		errors?: unknown[];
	};
	compileStyle: (options: {
		id: string;
		source: string;
		filename: string;
		scoped?: boolean;
		isProd: boolean;
	}) => {
		code: string;
		errors?: unknown[];
	};
};

const toErrorMessage = (error: unknown) => {
	if (!error) return 'Unknown Vue SFC compiler error.';
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === 'string') return message;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
};

const toScopeHash = (value: string) => {
	let hash = 5381;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 33) ^ value.charCodeAt(index);
	}
	return (hash >>> 0).toString(16);
};

let compilerPromise: Promise<VueCompiler> | null = null;

const loadVueCompiler = (): Promise<VueCompiler> => {
	if (compilerPromise) return compilerPromise;

	compilerPromise = (async () => {
		const vueVersion = await resolve_version('vue', 'latest').catch(() => '3.5.32');
		const compilerVersion = await resolve_version('@vue/compiler-sfc', vueVersion).catch(
			async () => resolve_version('@vue/compiler-sfc', 'latest').catch(() => '3.5.32')
		);
		const compilerPkg = await fetch_package('@vue/compiler-sfc', compilerVersion);
		const compilerSource = compilerPkg.contents['dist/compiler-sfc.esm-browser.js']?.text;

		if (!compilerSource) {
			throw new Error(
				`Could not load @vue/compiler-sfc@${compilerVersion}: missing dist/compiler-sfc.esm-browser.js`
			);
		}

		const compilerBlobUrl = URL.createObjectURL(
			new Blob(
				[
					`${compilerSource}\n//# sourceURL=@vue/compiler-sfc@${compilerVersion}/dist/compiler-sfc.esm-browser.js`
				],
				{ type: 'text/javascript' }
			)
		);

		try {
			const loadedModule = (await import(/* @vite-ignore */ compilerBlobUrl)) as VueCompiler;
			return loadedModule;
		} finally {
			URL.revokeObjectURL(compilerBlobUrl);
		}
	})();

	return compilerPromise;
};

const VUE_EXTENSION_REGEX = /\.vue$/;
const RENDER_EXPORT_REGEX = /\bexport\s+function\s+render\b/;

const vueSfcPlugin = (): Plugin => ({
	name: 'vue-sfc-transform',
	async transform(code, id) {
		if (!VUE_EXTENSION_REGEX.test(id)) return null;

		const compiler = await loadVueCompiler();
		const filename = id.replace(`${VIRTUAL}/`, '');

		const parsed = compiler.parse(code, {
			filename,
			sourceMap: false
		});
		const { descriptor, errors } = parsed;

		if (errors.length > 0) {
			throw new Error(
				`Vue SFC parse error in ${filename}:\n${errors.map((error) => toErrorMessage(error)).join('\n')}`
			);
		}

		if (
			descriptor.script?.src ||
			descriptor.scriptSetup?.src ||
			descriptor.template?.src ||
			descriptor.styles.some((style) => Boolean(style.src))
		) {
			throw new Error(
				`Unsupported Vue SFC feature in ${filename}: external src attributes are not supported in playground.`
			);
		}

		const scopeHash = toScopeHash(filename);
		const scopeId = `data-v-${scopeHash}`;
		const hasScopedStyles = descriptor.styles.some((style) => Boolean(style.scoped));

		let scriptCode = 'const __sfc__ = {};';
		let bindings: Record<string, unknown> = {};

		if (descriptor.script || descriptor.scriptSetup) {
			const compiledScript = compiler.compileScript(descriptor, {
				id: scopeHash,
				genDefaultAs: '__sfc__',
				inlineTemplate: false
			});
			scriptCode = compiledScript.content;
			bindings = compiledScript.bindings ?? {};
		}

		let templateCode = 'function render() { return null; }';

		if (descriptor.template?.content) {
			const compiledTemplate = compiler.compileTemplate({
				id: scopeHash,
				source: descriptor.template.content,
				filename,
				scoped: hasScopedStyles,
				isProd: true,
				compilerOptions: {
					bindingMetadata: bindings
				}
			});

			if (compiledTemplate.errors?.length) {
				throw new Error(
					`Vue template compile error in ${filename}:\n${compiledTemplate.errors
						.map((error) => toErrorMessage(error))
						.join('\n')}`
				);
			}

			templateCode = compiledTemplate.code.replace(RENDER_EXPORT_REGEX, 'function render');
		}

		let styleCode = '';
		if (descriptor.styles.length > 0) {
			const styleBlocks: string[] = [];
			for (let index = 0; index < descriptor.styles.length; index += 1) {
				const style = descriptor.styles[index]!;
				const compiledStyle = compiler.compileStyle({
					id: scopeHash,
					source: style.content,
					filename,
					scoped: style.scoped,
					isProd: true
				});

				if (compiledStyle.errors?.length) {
					throw new Error(
						`Vue style compile error in ${filename}:\n${compiledStyle.errors
							.map((error) => toErrorMessage(error))
							.join('\n')}`
					);
				}

				styleBlocks.push(`
					const __vue_style_${index} = document.createElement('style');
					__vue_style_${index}.textContent = ${JSON.stringify(compiledStyle.code)};
					document.head.append(__vue_style_${index});
					__vue_styles__.push(__vue_style_${index});
				`);
			}

			styleCode = `
				import { styles as __vue_styles__ } from '${VIRTUAL}/__styles.js';
				${styleBlocks.join('\n')}
			`;
		}

		const assembledCode = `
			${scriptCode}
			${templateCode}
			${hasScopedStyles ? `__sfc__.__scopeId = ${JSON.stringify(scopeId)};` : ''}
			${styleCode}
			__sfc__.render = render;
			export default __sfc__;
		`;

		const transformed = Babel.transform(assembledCode, {
			filename: `${id}.ts`,
			sourceType: 'module',
			presets: [
				[
					'typescript',
					{
						allExtensions: true,
						isTSX: false,
						allowDeclareFields: true
					}
				]
			]
		}).code;

		if (!transformed) {
			throw new Error(`Failed to transform Vue SFC: ${filename}`);
		}

		return {
			code: transformed,
			map: null
		};
	}
});

export default vueSfcPlugin;
