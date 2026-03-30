// @ts-nocheck
import { rollup } from '@rollup/browser';
import { DEV } from 'esm-env';
import typescript_strip_types from './plugins/typescript';
import commonjs from './plugins/commonjs';
import glsl from './plugins/glsl';
import json from './plugins/json';
import mp3 from './plugins/mp3';
import image from './plugins/image';
import svg from './plugins/svg';
import replace from './plugins/replace';
import alias_plugin, { resolve } from './plugins/alias';
import type { Plugin, RollupCache, TransformResult } from '@rollup/browser';
import type { BundleMessageData, BundleOptions } from '../workers';
import type { CompileError, CompileResult } from 'svelte/compiler';
import type { BundleResult, PlaygroundFile as File } from '../../types';
import { max } from './semver';
import { NPM, VIRTUAL } from '../constants';
import {
	normalize_path,
	fetch_package,
	load_svelte,
	parse_npm_url,
	resolve_local,
	resolve_local_motiongpu,
	resolve_local_motiongpu_relative,
	resolve_subpath,
	resolve_version,
	type Package
} from '../npm';

// hack for magic-string and rollup inline sourcemaps
// do not put this into a separate module and import it, would be treeshaken in prod
self.window = self;

const ENTRYPOINT = '__entry.js';
const WRAPPER = '__wrapper.svelte';
const STYLES = '__styles.js';
const ESM_ENV = '__esm-env.js';

let current_id: number;

self.addEventListener('message', async (event: MessageEvent<BundleMessageData>) => {
	switch (event.data.type) {
		case 'init': {
			get_svelte(event.data.svelte_version);
			break;
		}

		case 'bundle': {
			try {
				const { uid, files, options } = event.data;
				const {
					svelte,
					version: svelte_version,
					can_use_experimental_async
				} = await get_svelte(options.svelte_version);

				current_id = uid;

				setTimeout(async () => {
					if (current_id !== uid) return;

					const use_async = can_use_experimental_async;

					const result = await bundle(svelte, svelte_version, uid, files, options, use_async);

					// error object might be augmented, see https://github.com/rollup/rollup/blob/76a3b8ede4729a71eb522fc29f7d550a4358827b/docs/plugin-development/index.md#thiserror,
					// hence only check that the specific abort property we set is there
					if ((result.error as any)?.svelte_bundler_aborted === ABORT.svelte_bundler_aborted) {
						return;
					}
					if (result && uid === current_id) postMessage(result);
				});
			} catch (e) {
				self.postMessage({
					type: 'error',
					uid: event.data.uid,
					message: `Error loading the compiler: ${(e as Error).message}`
				});
			}

			break;
		}
	}
});

let ready: ReturnType<typeof load_svelte>;
let ready_version: string;

function get_svelte(svelte_version: string) {
	if (ready_version === svelte_version) return ready;

	self.postMessage({ type: 'status', message: `fetching svelte@${svelte_version}` });
	ready_version = svelte_version;
	ready = load_svelte(svelte_version || 'latest');
	ready.then(({ version, can_use_experimental_async }) => {
		ready_version = version;
		self.postMessage({
			type: 'version',
			version,
			supports_async: can_use_experimental_async
		});
	});
	return ready;
}

const ABORT = { svelte_bundler_aborted: true };

let previous: {
	key: string;
	cache: RollupCache | undefined;
};

async function get_bundle(
	svelte: typeof import('svelte/compiler'),
	svelte_version: string,
	uid: number,
	virtual: Map<string, File>,
	options: BundleOptions,
	can_use_experimental_async: boolean
) {
	let bundle;

	const key = JSON.stringify(options);
	const warnings: unknown[] = [];
	const all_warnings: Array<{ message: string }> = [];

	const repl_plugin: Plugin = {
		name: 'svelte-repl',
		async resolveId(importee, importer) {
			if (uid !== current_id) throw ABORT;

			// entrypoint
			if (!importer) return `${VIRTUAL}/${ENTRYPOINT}`;

			// special case
			if (importee === 'esm-env') return `${VIRTUAL}/${ESM_ENV}`;

			// importing from a URL
			if (/^[a-z]+:/.test(importee)) return importee;

			/** The npm package we're importing from, if any */
			let current: null | Package;

			if (importer.startsWith(NPM)) {
				const { name, version } = parse_npm_url(importer);
				current = await fetch_package(name, name === 'svelte' ? svelte_version : version);
			}

			// importing a relative file
			if (importee[0] === '.') {
				if (importer.startsWith(VIRTUAL)) {
					return resolve(virtual, importee, importer);
				}

				if (current) {
					const { name, version } = current.meta;
					const path = new URL(importee, importer).href.replace(`${NPM}/${name}@${version}/`, '');

					return normalize_path(current, path, importee, importer);
				}

				const resolved_url = new URL(importee, importer).href;

				// Normalize local motion-gpu imports to include file extension,
				// so that './foo' and './foo.js' resolve to the same module ID.
				if (resolved_url.startsWith(`${location.origin}/motion-gpu/`)) {
					return await resolve_local_motiongpu_relative(resolved_url);
				}

				return resolved_url;
			}

			// importing a file from the same package via pkg.imports
			if (importee[0] === '#') {
				if (current) {
					const subpath = resolve_subpath(current, importee);
					return normalize_path(current, subpath.slice(2), importee, importer);
				}
				return await resolve_local(importee);
			}

			// importing an external package -> `npm://$/<name>@<version>/<path>`
			const match = /^((?:@[^/]+\/)?[^/@]+)(?:@([^/]+))?(\/.+)?$/.exec(importee);
			if (!match) throw new Error(`Invalid import "${importee}"`);

			const pkg_name = match[1];

			if (pkg_name === 'svelte' && svelte_version === 'local') {
				return await resolve_local(importee);
			}

			// Resolve local workspace package only in development.
			// In deployed runtimes (e.g. Cloudflare Workers), local filesystem-backed
			// package serving may be unavailable, so we fall back to npm resolution.
			if (pkg_name === '@motion-core/motion-gpu' && DEV) {
				try {
					return await resolve_local_motiongpu(importee);
				} catch (error) {
					console.warn(
						`[bundler] Failed to resolve local @motion-core/motion-gpu for "${importee}", falling back to npm resolution`,
						error
					);
				}
			}

			let default_version = 'latest';

			if (current) {
				// use the version specified in importer's package.json, not `latest`
				const { meta } = current;

				if (meta.name === pkg_name) {
					default_version = meta.version;
				} else {
					default_version = max(
						meta.devDependencies?.[pkg_name] ??
							meta.peerDependencies?.[pkg_name] ??
							meta.dependencies?.[pkg_name]
					);
				}
			}

			const v = await resolve_version(match[1], match[2] ?? default_version);
			const pkg = await fetch_package(pkg_name, pkg_name === 'svelte' ? svelte_version : v);
			const subpath = resolve_subpath(pkg, '.' + (match[3] ?? ''));

			return normalize_path(pkg, subpath.slice(2), importee, importer);
		},
		async load(resolved) {
			if (uid !== current_id) throw ABORT;

			if (resolved.startsWith(VIRTUAL)) {
				const file = virtual.get(resolved.slice(VIRTUAL.length + 1))!;
				return file.contents;
			}

			if (resolved.startsWith(NPM)) {
				let [, name, v, subpath] = /^npm:\/\/\$\/((?:@[^/]+\/)?[^/@]+)(?:@([^/]+))?\/(.+)$/.exec(
					resolved
				)!;

				const pkg = await fetch_package(name, name === 'svelte' ? svelte_version : v);

				const file = pkg.contents[subpath];
				if (file) return file.text;
			}

			const response = await fetch(resolved);
			if (response.ok) return response.text();

			throw new Error(`Could not load ${resolved}`);
		},
		transform(code, id) {
			if (uid !== current_id) throw ABORT;

			const name = id.replace(VIRTUAL + '/', '').replace(NPM + '/', '');

			self.postMessage({ type: 'status', message: `bundling ${name}` });

			if (!/\.(svelte|js|ts)$/.test(id)) return null;

			let result: CompileResult;

			if (id.endsWith('.svelte')) {
				const is_gt_5 = Number(svelte.VERSION.split('.')[0]) >= 5;

				const compilerOptions: any = {
					filename: name,
					generate: is_gt_5 ? 'client' : 'dom',
					dev: false
				};

				if (is_gt_5) {
					compilerOptions.runes = options.runes;
				}

				if (can_use_experimental_async) {
					compilerOptions.experimental = { async: true };
				}

				result = svelte.compile(code, compilerOptions);

				if (result.css?.code) {
					// resolve local files by inlining them
					result.css.code = result.css.code.replace(
						/url\(['"]?\.\/(.+?\.(svg|webp|png))['"]?\)/g,
						(match, $1, $2) => {
							if (virtual.has($1)) {
								if ($2 === 'svg') {
									return `url('data:image/svg+xml;base64,${btoa(virtual.get($1)!.contents)}')`;
								} else {
									return `url('data:image/${$2};base64,${virtual.get($1)!.contents}')`;
								}
							} else {
								return match;
							}
						}
					);
					// add the CSS via injecting a style tag
					result.js.code +=
						'\n\n' +
						`
					import { styles as $$_styles } from '${VIRTUAL}/${STYLES}';
					const $$__style = document.createElement('style');
					$$__style.textContent = ${JSON.stringify(result.css.code)};
					document.head.append($$__style);
					$$_styles.push($$__style);
				`.replace(/\t/g, '');
				}
			} else if (/\.svelte\.(js|ts)$/.test(id)) {
				const compilerOptions: any = {
					filename: name,
					generate: 'client',
					dev: false
				};

				if (can_use_experimental_async) {
					compilerOptions.experimental = { async: true };
				}

				result = svelte.compileModule?.(code, compilerOptions);

				if (!result) {
					return null;
				}
			} else {
				return null;
			}

			// @ts-expect-error
			(result.warnings || result.stats?.warnings)?.forEach((warning) => {
				// This is required, otherwise postMessage won't work
				// @ts-ignore
				delete warning.toString;
				// TODO remove stats post-launch
				// @ts-ignore
				warnings.push(warning);
			});

			const transform_result: TransformResult = {
				code: result.js.code,
				map: result.js.map
			};

			return transform_result;
		}
	};

	const handled_css_ids = new Set<string>();
	let user_css = '';

	bundle = await rollup({
		input: './__entry.js',
		cache: previous?.key === key ? previous.cache : true,
		plugins: [
			alias_plugin(undefined, virtual),
			typescript_strip_types,
			repl_plugin,
			commonjs,
			json,
			svg,
			mp3,
			image,
			glsl,
			replace({
				'process.env.NODE_ENV': JSON.stringify('production')
			}),
			{
				name: 'css',
				transform(code, id) {
					if (id.endsWith('.css')) {
						if (!handled_css_ids.has(id)) {
							handled_css_ids.add(id);
							// We do not resolve nested CSS imports in the playground runtime.
							user_css += '\n' + code.replace(/@import\s+["'][^"']+["'][^;]*;/g, '');
						}
						return {
							code: '',
							map: null
						};
					}
				}
			}
		],
		onwarn(warning) {
			all_warnings.push({
				message: warning.message
			});
		}
	});

	previous = { key, cache: bundle.cache };

	return {
		bundle,
		css: user_css ? user_css : null,
		error: null,
		warnings,
		all_warnings
	};
}

async function bundle(
	svelte: typeof import('svelte/compiler'),
	svelte_version: string,
	uid: number,
	files: File[],
	options: BundleOptions,
	can_use_experimental_async: boolean
): Promise<BundleResult> {
	if (!DEV) {
		console.log(`running Svelte compiler version %c${svelte.VERSION}`, 'font-weight: bold');
	}

	const lookup: Map<string, File> = new Map();

	lookup.set(ENTRYPOINT, {
		type: 'file',
		name: ENTRYPOINT,
		basename: ENTRYPOINT,
		contents:
			svelte.VERSION.split('.')[0] >= '5'
				? `
			import { unmount as u } from 'svelte';
			import { styles } from '${VIRTUAL}/${STYLES}';
			export { mount, untrack } from 'svelte';
			export { default as App } from '${VIRTUAL}/${WRAPPER}';
			export function unmount(component) {
				u(component);
				styles.forEach(style => style.remove());
			}
		`
				: `
			import { styles } from '${VIRTUAL}/${STYLES}';
			export { default as App } from './App.svelte';
			export function mount(component, options) {
				return new component(options);
			}
			export function unmount(component) {
				component.$destroy();
				styles.forEach(style => style.remove());
			}
			export function untrack(fn) {
				return fn();
			}
		`,
		text: true
	});

	const wrapper = can_use_experimental_async
		? `
		<script>
			import App from './App.svelte';
		</script>

		<svelte:boundary>
			<App />

			{#snippet pending()}{/snippet}
		</svelte:boundary>
	`
		: `
		<script>
			import App from './App.svelte';
		</script>

		<App />
	`;

	lookup.set(WRAPPER, {
		type: 'file',
		name: WRAPPER,
		basename: WRAPPER,
		contents: wrapper,
		text: true
	});

	lookup.set(STYLES, {
		type: 'file',
		name: STYLES,
		basename: STYLES,
		contents: `
			export let styles = [];
		`,
		text: true
	});

	lookup.set(ESM_ENV, {
		type: 'file',
		name: STYLES,
		basename: STYLES,
		contents: `
			export const BROWSER = true;
			export const DEV = true;
		`,
		text: true
	});

	files.forEach((file) => {
		lookup.set(file.name, file);
	});

	try {
		let client: Awaited<ReturnType<typeof get_bundle>> = await get_bundle(
			svelte,
			svelte_version,
			uid,
			lookup,
			options,
			can_use_experimental_async
		);

		const client_result = (
			await client.bundle?.generate({
				format: 'iife',
				exports: 'named',
				inlineDynamicImports: true
				// sourcemap: 'inline'
			})
		)?.output[0];

		return {
			uid,
			error: null,
			client: client_result,
			css: client.css
		};
	} catch (err) {
		console.error(err);

		const e = err as CompileError; // TODO could be a non-Svelte error?

		return {
			uid,
			error: { ...e, message: e.message }, // not all Svelte versions return an enumerable message property
			client: null,
			css: null
		};
	}
}
