import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const packageRoot = path.dirname(fileURLToPath(new URL('./package.json', import.meta.url)));
const sourceRoot = path.resolve(packageRoot, 'src/lib');

function collectScriptEntryPoints(directory: string): Record<string, string> {
	const entries = readdirSync(directory, { withFileTypes: true });
	const entryPoints: Record<string, string> = {};

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			Object.assign(entryPoints, collectScriptEntryPoints(fullPath));
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}
		if (!(fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
			continue;
		}

		const entryName = toPosixPath(path.relative(sourceRoot, fullPath)).replace(/\.[^/.]+$/, '');
		entryPoints[entryName] = fullPath;
	}

	return entryPoints;
}

const entryPoints = collectScriptEntryPoints(sourceRoot);

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
	const patchDtsScript = path.resolve(packageRoot, 'scripts/build/patch-webgpu-types-dts.mjs');

	return {
		name: 'motion-gpu-emit-types',
		apply: 'build',
		async writeBundle() {
			await runNodeScript(emitDtsScript);
			await runNodeScript(patchDtsScript);
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
	return false;
}

export default defineConfig({
	plugins: [copySvelteFilesPlugin(), emitTypesPlugin()],
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
		rolldownOptions: {
			treeshake: false,
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
