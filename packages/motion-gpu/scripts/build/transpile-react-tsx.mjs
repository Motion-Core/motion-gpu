import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import typescript from 'typescript';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const reactDistDirectory = path.resolve(dirname, '../../dist/react');

async function collectTsxFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return collectTsxFiles(fullPath);
			}
			if (entry.isFile() && fullPath.endsWith('.tsx')) {
				return [fullPath];
			}
			return [];
		})
	);

	return files.flat();
}

async function transpileReactTsxInDist() {
	const tsxFiles = await collectTsxFiles(reactDistDirectory);
	if (tsxFiles.length === 0) {
		console.log('No React TSX files found in dist/react');
		return;
	}

	for (const tsxFile of tsxFiles) {
		const source = await readFile(tsxFile, 'utf8');
		const result = typescript.transpileModule(source, {
			fileName: tsxFile,
			compilerOptions: {
				module: typescript.ModuleKind.ESNext,
				target: typescript.ScriptTarget.ES2022,
				jsx: typescript.JsxEmit.ReactJSX,
				newLine: typescript.NewLineKind.LineFeed,
				sourceMap: false,
				inlineSourceMap: false,
				inlineSources: false,
				declaration: false,
				declarationMap: false
			}
		});

		const outputPath = tsxFile.slice(0, -4) + '.js';
		await writeFile(outputPath, result.outputText, 'utf8');
		await unlink(tsxFile);
	}

	console.log(`Transpiled ${tsxFiles.length} React TSX files in dist/react`);
}

await transpileReactTsxInDist();
