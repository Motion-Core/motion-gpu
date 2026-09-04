import { readFile } from 'node:fs/promises';

function isPublishedSpektralJavaScript(id) {
	const file = id.split('?', 1)[0].replaceAll('\\', '/');
	return file.includes('/node_modules/spektral/dist/') && file.endsWith('.js');
}

/**
 * Loads each published Spektral JavaScript module together with its source
 * map. Rollup plugins must return upstream maps from load; a sourceMappingURL
 * comment in a node_modules input is not chained by default.
 */
export function preserveSpektralSourceMaps() {
	return {
		name: 'preserve-published-spektral-source-maps',
		enforce: 'pre',
		async load(id) {
			if (!isPublishedSpektralJavaScript(id)) return null;
			const file = id.split('?', 1)[0];
			try {
				const map = JSON.parse(await readFile(`${file}.map`, 'utf8'));
				const code = await readFile(file, 'utf8');
				return { code, map };
			} catch (error) {
				if (error?.code === 'ENOENT') return null;
				throw error;
			}
		}
	};
}
