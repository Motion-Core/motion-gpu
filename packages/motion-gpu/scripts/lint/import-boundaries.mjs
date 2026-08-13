import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const repositoryRoot = path.resolve(packageRoot, '../..');
const libraryRoot = path.join(packageRoot, 'src/lib');
const sourceExtensions = ['.ts', '.tsx', '.svelte', '.vue'];
const adapterLayers = new Set(['react', 'svelte', 'vue']);

function normalizeFile(file) {
	return file.split(path.sep).join('/');
}

function stripKnownExtension(specifier) {
	for (const extension of [...sourceExtensions, '.js']) {
		if (specifier.endsWith(extension)) {
			return specifier.slice(0, -extension.length);
		}
	}

	return specifier;
}

export function extractImportSpecifiers(source) {
	const preprocessed = ts.preProcessFile(source, true, true);
	return [...new Set(preprocessed.importedFiles.map(({ fileName }) => fileName))];
}

function resolveRelativeImport(importer, specifier, files) {
	if (!specifier.startsWith('.')) {
		return null;
	}

	const base = path.posix.normalize(
		path.posix.join(path.posix.dirname(importer), stripKnownExtension(specifier))
	);
	for (const candidate of [
		base,
		...sourceExtensions.map((extension) => `${base}${extension}`),
		...sourceExtensions.map((extension) => `${base}/index${extension}`)
	]) {
		if (files.has(candidate)) {
			return candidate;
		}
	}

	return null;
}

function sourceLayer(file) {
	return file.split('/')[0] ?? '';
}

function findCycles(graph) {
	const visited = new Set();
	const visiting = new Set();
	const stack = [];
	const cycles = [];
	const cycleKeys = new Set();

	function visit(file) {
		if (visiting.has(file)) {
			const start = stack.indexOf(file);
			const cycle = [...stack.slice(start), file];
			const members = [...new Set(cycle)].sort();
			const key = members.join('|');
			if (!cycleKeys.has(key)) {
				cycleKeys.add(key);
				cycles.push(cycle);
			}
			return;
		}
		if (visited.has(file)) {
			return;
		}

		visiting.add(file);
		stack.push(file);
		for (const dependency of graph.get(file) ?? []) {
			visit(dependency);
		}
		stack.pop();
		visiting.delete(file);
		visited.add(file);
	}

	for (const file of graph.keys()) {
		visit(file);
	}

	return cycles;
}

function isPackageInternalSpecifier(specifier) {
	return (
		/^@motion-core\/motion-gpu\/(?:src|dist)(?:\/|$)/.test(specifier) ||
		/(?:^|\/)packages\/motion-gpu\/(?:src|dist)(?:\/|$)/.test(specifier)
	);
}

export function analyzeImportBoundaries({ libraryFiles, consumerFiles = new Map() }) {
	const files = new Set(libraryFiles.keys());
	const graph = new Map([...files].map((file) => [file, new Set()]));
	const violations = [];

	for (const [file, source] of libraryFiles) {
		const importerLayer = sourceLayer(file);
		for (const specifier of extractImportSpecifiers(source)) {
			const target = resolveRelativeImport(file, specifier, files);
			if (!target || target === file) {
				continue;
			}

			graph.get(file)?.add(target);
			const targetLayer = sourceLayer(target);
			if (importerLayer === 'core' && adapterLayers.has(targetLayer)) {
				violations.push(`${file}: core cannot import adapter module ${target}`);
			}
			if (
				adapterLayers.has(importerLayer) &&
				adapterLayers.has(targetLayer) &&
				importerLayer !== targetLayer
			) {
				violations.push(`${file}: ${importerLayer} cannot import sibling adapter ${target}`);
			}
		}
	}

	for (const cycle of findCycles(graph)) {
		violations.push(`dependency cycle: ${cycle.join(' -> ')}`);
	}

	for (const [file, source] of consumerFiles) {
		for (const specifier of extractImportSpecifiers(source)) {
			if (isPackageInternalSpecifier(specifier)) {
				violations.push(`${file}: consumer cannot import package internal ${specifier}`);
			}
		}
	}

	return {
		edgeCount: [...graph.values()].reduce((total, dependencies) => total + dependencies.size, 0),
		violations
	};
}

async function collectSourceFiles(root, relativeTo) {
	const files = new Map();

	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.svelte-kit') {
				continue;
			}

			const absolutePath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(absolutePath);
			} else if (sourceExtensions.includes(path.extname(entry.name))) {
				files.set(
					normalizeFile(path.relative(relativeTo, absolutePath)),
					await readFile(absolutePath, 'utf8')
				);
			}
		}
	}

	await visit(root);
	return files;
}

export async function runImportBoundaryChecks() {
	const libraryFiles = await collectSourceFiles(libraryRoot, libraryRoot);
	const consumerFiles = await collectSourceFiles(path.join(repositoryRoot, 'apps'), repositoryRoot);
	const result = analyzeImportBoundaries({ libraryFiles, consumerFiles });

	if (result.violations.length > 0) {
		throw new Error(`Import boundary violations:\n- ${result.violations.join('\n- ')}`);
	}

	return { edgeCount: result.edgeCount, fileCount: libraryFiles.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const result = await runImportBoundaryChecks();
	console.log(
		`Import boundaries passed for ${result.fileCount} files and ${result.edgeCount} edges.`
	);
}
