import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const publicDeclarationPaths = [
	'index.d.ts',
	'advanced.d.ts',
	'core/index.d.ts',
	'core/advanced.d.ts',
	'react/index.d.ts',
	'react/advanced.d.ts',
	'svelte/index.d.ts',
	'svelte/advanced.d.ts',
	'vue/index.d.ts',
	'vue/advanced.d.ts'
];

async function collectFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(file)));
		else if (entry.isFile()) files.push(file);
	}
	return files;
}

function declarationCandidates(importingFile, moduleId) {
	const importedPath = path.resolve(path.dirname(importingFile), moduleId);
	return [
		importedPath,
		importedPath.replace(/\.js$/, '.d.ts'),
		`${importedPath}.d.ts`,
		importedPath.replace(/\.svelte$/, '.svelte.d.ts'),
		importedPath.replace(/\.vue$/, '.vue.d.ts'),
		path.join(importedPath, 'index.d.ts')
	];
}

function readDeclarationModuleIds(file, source) {
	const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	const moduleIds = [];
	function visit(node) {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			moduleIds.push(node.moduleSpecifier.text);
		} else if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteral(node.argument.literal)
		) {
			moduleIds.push(node.argument.literal.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return moduleIds;
}

function readRawSvelteModuleIds(source) {
	return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function resolveRelativeDeclaration({ declarationFiles, importingFile, moduleId }) {
	if (!moduleId.startsWith('.')) return null;
	if (moduleId.endsWith('.css')) return null;
	const resolved = declarationCandidates(importingFile, moduleId).find((candidate) =>
		declarationFiles.has(path.resolve(candidate))
	);
	if (!resolved) {
		throw new Error(
			`Generated declaration graph cannot resolve ${JSON.stringify(moduleId)} from ${importingFile}.`
		);
	}
	return path.resolve(resolved);
}

export async function findUnreachableDeclarations(distDirectory) {
	const distRoot = path.resolve(distDirectory);
	const files = await collectFiles(distRoot);
	const declarations = files
		.filter((file) => file.endsWith('.d.ts'))
		.map((file) => path.resolve(file));
	const declarationFiles = new Set(declarations);
	const roots = publicDeclarationPaths.map((file) => path.join(distRoot, file));
	roots.push(...declarations.filter((file) => /\.(?:svelte|vue)\.d\.ts$/.test(file)));

	for (const root of roots) {
		if (!declarationFiles.has(path.resolve(root))) {
			throw new Error(`Required generated declaration root is missing: ${root}.`);
		}
	}

	for (const svelteFile of files.filter(
		(file) => file.endsWith('.svelte') && !file.endsWith('.svelte.d.ts')
	)) {
		const source = await readFile(svelteFile, 'utf8');
		for (const moduleId of readRawSvelteModuleIds(source)) {
			const resolved = resolveRelativeDeclaration({
				declarationFiles,
				importingFile: svelteFile,
				moduleId
			});
			if (resolved) roots.push(resolved);
		}
	}

	const reachable = new Set();
	const pending = [...new Set(roots.map((file) => path.resolve(file)))];
	while (pending.length > 0) {
		const declaration = pending.pop();
		if (!declaration || reachable.has(declaration)) continue;
		reachable.add(declaration);
		const source = await readFile(declaration, 'utf8');
		for (const moduleId of readDeclarationModuleIds(declaration, source)) {
			const resolved = resolveRelativeDeclaration({
				declarationFiles,
				importingFile: declaration,
				moduleId
			});
			if (resolved && !reachable.has(resolved)) pending.push(resolved);
		}
	}

	return {
		reachable: [...reachable].sort(),
		unreachable: declarations.filter((file) => !reachable.has(file)).sort()
	};
}

export async function pruneUnreachableDeclarations(distDirectory) {
	const result = await findUnreachableDeclarations(distDirectory);
	const removedBytes = (
		await Promise.all(result.unreachable.map(async (file) => (await stat(file)).size))
	).reduce((total, size) => total + size, 0);
	await Promise.all(result.unreachable.map((file) => rm(file)));
	return { ...result, removedBytes };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
	const packageRoot = path.resolve(import.meta.dirname, '../..');
	const result = await pruneUnreachableDeclarations(path.join(packageRoot, 'dist'));
	console.log(
		`Pruned ${result.unreachable.length} unreachable declaration files (${result.removedBytes} bytes)`
	);
}
