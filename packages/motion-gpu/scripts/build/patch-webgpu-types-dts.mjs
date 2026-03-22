import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(dirname, '../../dist');

const WEBGPU_REFERENCE = '/// <reference types="@webgpu/types" />';
const GPU_TYPE_PATTERN = /\bGPU[A-Z]\w*/;

async function collectDeclarationFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return collectDeclarationFiles(fullPath);
			}
			if (entry.isFile() && fullPath.endsWith('.d.ts')) {
				return [fullPath];
			}
			return [];
		})
	);

	return files.flat();
}

async function patchWebGPUTypesReferences() {
	const declarationFiles = await collectDeclarationFiles(distDirectory);
	let patchedFilesCount = 0;

	for (const declarationFile of declarationFiles) {
		const source = await readFile(declarationFile, 'utf8');
		if (!GPU_TYPE_PATTERN.test(source) || source.includes(WEBGPU_REFERENCE)) {
			continue;
		}

		const nextSource = `${WEBGPU_REFERENCE}\n${source}`;
		await writeFile(declarationFile, nextSource, 'utf8');
		patchedFilesCount += 1;
	}

	console.log(`Patched ${patchedFilesCount} declaration files with @webgpu/types reference`);
}

await patchWebGPUTypesReferences();
