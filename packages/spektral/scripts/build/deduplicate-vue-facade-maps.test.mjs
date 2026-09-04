import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deduplicateVueFacadeMaps, vueFacadeNames } from './deduplicate-vue-facade-maps.mjs';

async function createVueMapFixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'spektral-vue-maps-'));
	const vueDirectory = path.join(root, 'vue');
	await mkdir(vueDirectory, { recursive: true });
	for (const facadeName of vueFacadeNames) {
		const implementationName = `${facadeName}.vue_vue_type_script_setup_true_lang.js`;
		const map = JSON.stringify({
			version: 3,
			sources: [`../../src/lib/vue/${facadeName}.vue`],
			sourcesContent: [`<script setup>const name = '${facadeName}'</script>`],
			names: [],
			mappings: 'AAAA'
		});
		await writeFile(
			path.join(vueDirectory, `${facadeName}.js`),
			`import e from"./${implementationName}";export{e as default};\n//# sourceMappingURL=${facadeName}.js.map`
		);
		await writeFile(path.join(vueDirectory, `${facadeName}.js.map`), map);
		await writeFile(path.join(vueDirectory, `${implementationName}.map`), map);
	}
	return root;
}

test('removes only duplicate generated Vue facade maps and their references', async () => {
	const root = await createVueMapFixture();
	try {
		const result = await deduplicateVueFacadeMaps(root);
		assert.equal(result.removedMaps, 3);
		assert.ok(result.removedBytes > 0);
		for (const facadeName of vueFacadeNames) {
			const facade = await readFile(path.join(root, 'vue', `${facadeName}.js`), 'utf8');
			assert.doesNotMatch(facade, /sourceMappingURL/);
			await assert.rejects(access(path.join(root, 'vue', `${facadeName}.js.map`)), /ENOENT/);
			await access(
				path.join(root, 'vue', `${facadeName}.vue_vue_type_script_setup_true_lang.js.map`)
			);
		}
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});

test('fails closed if a facade map does not duplicate the implementation source', async () => {
	const root = await createVueMapFixture();
	try {
		const mapPath = path.join(root, 'vue', 'Portal.js.map');
		const map = JSON.parse(await readFile(mapPath, 'utf8'));
		map.sourcesContent[0] = '<script setup>changed</script>';
		await writeFile(mapPath, JSON.stringify(map));
		await assert.rejects(deduplicateVueFacadeMaps(root), /do not embed the same source/);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});
