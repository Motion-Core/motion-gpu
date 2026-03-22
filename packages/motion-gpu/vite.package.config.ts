import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const packageRoot = path.dirname(fileURLToPath(new URL('./package.json', import.meta.url)));
const sourceRoot = path.resolve(packageRoot, 'src/lib');

const entryPoints = {
	index: path.resolve(sourceRoot, 'index.ts'),
	advanced: path.resolve(sourceRoot, 'advanced.ts'),
	'core/index': path.resolve(sourceRoot, 'core/index.ts'),
	'core/advanced': path.resolve(sourceRoot, 'core/advanced.ts'),
	'react/index': path.resolve(sourceRoot, 'react/index.ts'),
	'react/advanced': path.resolve(sourceRoot, 'react/advanced.ts'),
	'svelte/index': path.resolve(sourceRoot, 'svelte/index.ts'),
	'svelte/advanced': path.resolve(sourceRoot, 'svelte/advanced.ts')
} as const;

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
		name: 'motion-gpu-copy-svelte-files',
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

function isExternal(id: string): boolean {
	if (id.endsWith('.svelte')) {
		return true;
	}
	if (id === 'react' || id === 'react-dom' || id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
		return true;
	}
	if (id === 'svelte' || id.startsWith('svelte/')) {
		return true;
	}
	return false;
}

export default defineConfig({
	plugins: [copySvelteFilesPlugin()],
	build: {
		target: 'es2022',
		outDir: 'dist',
		emptyOutDir: true,
		sourcemap: true,
		minify: false,
		reportCompressedSize: false,
		lib: {
			entry: entryPoints,
			formats: ['es']
		},
		rollupOptions: {
			external: isExternal,
			output: {
				format: 'es',
				preserveModules: true,
				preserveModulesRoot: sourceRoot,
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name]-[hash].js'
			}
		}
	}
});
