import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

const packageRoot = path.dirname(fileURLToPath(new URL('./package.json', import.meta.url)));
const sourceRoot = path.resolve(packageRoot, 'src/lib');

const publicEntryPaths = [
	'index',
	'advanced',
	'core/index',
	'core/advanced',
	'react/index',
	'react/advanced',
	'svelte/index',
	'svelte/advanced',
	'vue/index',
	'vue/advanced'
];

// Raw Svelte components are published unchanged. These adapter-local modules expose providers used
// only by the raw components, so they must be build entries to survive tree shaking. Core imports
// remain live through the public core and compiled adapter graphs. These are not package exports.
const rawSvelteRuntimeEntryPaths = ['svelte/frame-context', 'svelte/spektral-context'];

const entryPoints = Object.fromEntries(
	[...publicEntryPaths, ...rawSvelteRuntimeEntryPaths].map((entry) => [
		entry,
		path.resolve(sourceRoot, `${entry}.ts`)
	])
);

function toPosixPath(value: string) {
	return value.split(path.sep).join('/');
}

function collectSvelteFiles(directory: string): string[] {
	const entries = readdirSync(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSvelteFiles(fullPath));
			continue;
		}
		if (entry.isFile() && fullPath.endsWith('.svelte')) {
			files.push(fullPath);
		}
	}
	return files;
}

function copySvelteFilesPlugin(): Plugin {
	let svelteFiles: string[] = [];
	return {
		name: 'spektral-copy-svelte-files',
		buildStart() {
			svelteFiles = collectSvelteFiles(sourceRoot);
		},
		generateBundle() {
			for (const sourceFile of svelteFiles) {
				const fileName = toPosixPath(path.relative(sourceRoot, sourceFile));
				this.emitFile({
					type: 'asset',
					fileName,
					source: readFileSync(sourceFile, 'utf8')
				});
			}
		}
	};
}

function runNodeScript(scriptPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath], {
			cwd: packageRoot,
			stdio: 'inherit'
		});

		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`Script failed (${scriptPath}) with exit code ${code ?? 'unknown'}`));
		});
	});
}

function emitTypesPlugin(): Plugin {
	const emitDtsScript = path.resolve(packageRoot, 'scripts/build/emit-dts.mjs');
	const emitVueDtsScript = path.resolve(packageRoot, 'scripts/build/emit-vue-dts.mjs');
	const pruneDtsScript = path.resolve(packageRoot, 'scripts/build/prune-unreachable-dts.mjs');
	const patchDtsScript = path.resolve(packageRoot, 'scripts/build/patch-webgpu-types-dts.mjs');
	const deduplicateVueMapsScript = path.resolve(
		packageRoot,
		'scripts/build/deduplicate-vue-facade-maps.mjs'
	);

	return {
		name: 'spektral-emit-types',
		apply: 'build',
		async writeBundle() {
			await runNodeScript(emitDtsScript);
			await runNodeScript(emitVueDtsScript);
			await runNodeScript(pruneDtsScript);
			await runNodeScript(patchDtsScript);
			await runNodeScript(deduplicateVueMapsScript);
		}
	};
}

function injectAdapterCssImportsPlugin(): Plugin {
	const adapterEntryChunkPaths = [
		'react/index.js',
		'react/advanced.js',
		'svelte/index.js',
		'svelte/advanced.js',
		'vue/index.js',
		'vue/advanced.js'
	];
	const adapterCssImport = "import '../spektral.css';\n";

	return {
		name: 'spektral-inject-adapter-css-imports',
		apply: 'build',
		generateBundle(_, bundle) {
			for (const chunkPath of adapterEntryChunkPaths) {
				const chunk = bundle[chunkPath];
				if (chunk?.type === 'chunk' && !chunk.code.includes('../spektral.css')) {
					chunk.code = `${adapterCssImport}${chunk.code}`;
				}
			}
		}
	};
}

function isExternal(id: string): boolean {
	if (id.endsWith('.svelte')) {
		return true;
	}
	if (
		id === 'react' ||
		id === 'react-dom' ||
		id === 'react/jsx-runtime' ||
		id === 'react/jsx-dev-runtime'
	) {
		return true;
	}
	if (id === 'svelte' || id.startsWith('svelte/')) {
		return true;
	}
	if (id === 'vue' || id.startsWith('vue/')) {
		return true;
	}
	return false;
}

export default defineConfig({
	plugins: [vue(), copySvelteFilesPlugin(), injectAdapterCssImportsPlugin(), emitTypesPlugin()],
	build: {
		target: 'es2022',
		outDir: 'dist',
		emptyOutDir: true,
		sourcemap: true,
		minify: 'oxc',
		reportCompressedSize: false,
		lib: {
			entry: entryPoints,
			formats: ['es']
		},
		rolldownOptions: {
			external: isExternal,
			output: {
				format: 'es',
				preserveModules: true,
				preserveModulesRoot: sourceRoot,
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name]-[hash].js',
				minify: {
					compress: true,
					mangle: true,
					codegen: { removeWhitespace: true, legalComments: 'none' }
				}
			}
		}
	}
});
