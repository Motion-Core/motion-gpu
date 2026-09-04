import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const vueFacadeNames = ['FragCanvas', 'Portal', 'SpektralErrorOverlay'];

function assertEquivalentAuthoredSources(facadeName, facadeMap, implementationMap) {
	for (const map of [facadeMap, implementationMap]) {
		if (
			map.version !== 3 ||
			!Array.isArray(map.sources) ||
			!Array.isArray(map.sourcesContent) ||
			map.sources.length !== map.sourcesContent.length
		) {
			throw new Error(`${facadeName} Vue map does not contain complete authored sources.`);
		}
	}
	if (
		JSON.stringify(facadeMap.sources) !== JSON.stringify(implementationMap.sources) ||
		JSON.stringify(facadeMap.sourcesContent) !== JSON.stringify(implementationMap.sourcesContent)
	) {
		throw new Error(
			`${facadeName} Vue facade and implementation maps do not embed the same source.`
		);
	}
}

export async function deduplicateVueFacadeMaps(distDirectory) {
	const vueDirectory = path.resolve(distDirectory, 'vue');
	let removedBytes = 0;
	for (const facadeName of vueFacadeNames) {
		const facadePath = path.join(vueDirectory, `${facadeName}.js`);
		const facadeMapPath = `${facadePath}.map`;
		const implementationName = `${facadeName}.vue_vue_type_script_setup_true_lang.js`;
		const implementationMapPath = path.join(vueDirectory, `${implementationName}.map`);
		const [facade, facadeMapSource, implementationMapSource] = await Promise.all([
			readFile(facadePath, 'utf8'),
			readFile(facadeMapPath, 'utf8'),
			readFile(implementationMapPath, 'utf8')
		]);
		if (!facade.includes(`from"./${implementationName}"`)) {
			throw new Error(`${facadeName} Vue facade no longer delegates to its mapped implementation.`);
		}
		const sourceMapComment = `\n//# sourceMappingURL=${facadeName}.js.map`;
		if (!facade.endsWith(sourceMapComment)) {
			throw new Error(`${facadeName} Vue facade has an unexpected source map reference.`);
		}
		assertEquivalentAuthoredSources(
			facadeName,
			JSON.parse(facadeMapSource),
			JSON.parse(implementationMapSource)
		);
		await writeFile(facadePath, facade.slice(0, -sourceMapComment.length), 'utf8');
		await rm(facadeMapPath);
		removedBytes += Buffer.byteLength(facadeMapSource) + Buffer.byteLength(sourceMapComment);
	}
	return { removedBytes, removedMaps: vueFacadeNames.length };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
	const packageRoot = path.resolve(import.meta.dirname, '../..');
	const result = await deduplicateVueFacadeMaps(path.join(packageRoot, 'dist'));
	console.log(
		`Removed ${result.removedMaps} duplicate generated Vue facade maps (${result.removedBytes} bytes)`
	);
}
