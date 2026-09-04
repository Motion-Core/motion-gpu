import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
	applyExactVersions,
	assertSharedNodeTypesAligned,
	assertBundledSourceNavigation,
	assertPublicApiSymbols,
	assertPublicExportMap,
	assertRuntimePublicApi,
	createNodeSsrImportContract,
	createNodeSsrLoader,
	createPublicApiCompileContract,
	injectPackageSpec,
	injectTarballPath,
	nodeSsrEntrypoints,
	nodeSsrEntrypointsByFixture,
	parsePackageSpec,
	parsePackedConsumerArguments,
	rebundledSourceMapContract
} from './packed-consumers.mjs';
import { publicApiManifest } from './public-api-manifest.mjs';
import { preserveSpektralSourceMaps } from './fixtures/vite-spektral-source-maps.mjs';

const publicEntries = Object.fromEntries(
	[
		'.',
		'./advanced',
		'./core',
		'./core/advanced',
		'./react',
		'./react/advanced',
		'./svelte',
		'./svelte/advanced',
		'./vue',
		'./vue/advanced'
	].map((entry) => [entry, { types: './dist/index.d.ts', default: './dist/index.js' }])
);

test('injects exactly one normalized packed artifact path', () => {
	assert.equal(
		injectTarballPath('{"package":"file:__SPEKTRAL_TARBALL__"}', '/tmp/package.tgz'),
		'{"package":"file:/tmp/package.tgz"}'
	);
	assert.throws(() => injectTarballPath('{}', '/tmp/package.tgz'), /found 0/);
	assert.throws(
		() =>
			injectTarballPath(
				'{"first":"__SPEKTRAL_TARBALL__","second":"__SPEKTRAL_TARBALL__"}',
				'/tmp/package.tgz'
			),
		/found 2/
	);
});

test('accepts only absolute tarballs or exact stable package versions', () => {
	assert.deepEqual(parsePackageSpec('/tmp/spektral.tgz'), {
		dependencySpec: 'file:/tmp/spektral.tgz',
		expectedVersion: undefined,
		type: 'tarball'
	});
	assert.deepEqual(parsePackageSpec('0.17.0'), {
		dependencySpec: '0.17.0',
		expectedVersion: '0.17.0',
		type: 'version'
	});
	for (const invalid of [
		'./spektral.tgz',
		'^0.17.0',
		'0.17.0-rc.1',
		'latest',
		'https://registry.npmjs.org/package.tgz'
	]) {
		assert.throws(
			() => parsePackageSpec(invalid),
			/absolute \.tgz path or an exact stable version/
		);
	}
});

test('injects a package spec without retaining the fixture file prefix', () => {
	const template = '{"package":"file:__SPEKTRAL_TARBALL__"}';
	assert.equal(
		injectPackageSpec(template, 'file:/tmp/package.tgz'),
		'{"package":"file:/tmp/package.tgz"}'
	);
	assert.equal(injectPackageSpec(template, '0.17.0'), '{"package":"0.17.0"}');
	assert.throws(() => injectPackageSpec('{}', '0.17.0'), /found 0/);
});

test('parses package spec and peer matrix CLI options without ambiguity', () => {
	assert.deepEqual(
		parsePackedConsumerArguments([
			'--browser-runtime',
			'--peer-matrix',
			'--package-spec',
			'/tmp/spektral.tgz'
		]),
		{
			includeBrowserRuntime: true,
			includeMinimumPeers: true,
			packageSpec: '/tmp/spektral.tgz'
		}
	);
	assert.deepEqual(parsePackedConsumerArguments([]), {
		includeBrowserRuntime: false,
		includeMinimumPeers: false,
		packageSpec: undefined
	});
	assert.throws(
		() => parsePackedConsumerArguments(['--browser-runtime', '--browser-runtime']),
		/may only be provided once/
	);
	assert.throws(() => parsePackedConsumerArguments(['--package-spec']), /requires a value/);
	assert.throws(
		() => parsePackedConsumerArguments(['--package-spec', '--peer-matrix']),
		/requires a value/
	);
	assert.throws(() => parsePackedConsumerArguments(['--unknown']), /Unknown/);
});

test('accepts only the complete public entrypoint contract', () => {
	assert.doesNotThrow(() => assertPublicExportMap(publicEntries));
	const missingVueAdvanced = { ...publicEntries };
	delete missingVueAdvanced['./vue/advanced'];
	assert.throws(
		() => assertPublicExportMap(missingVueAdvanced),
		/Packed manifest public entrypoints changed/
	);
	assert.throws(
		() => assertPublicExportMap({ ...publicEntries, './src': publicEntries['.'] }),
		/Packed manifest public entrypoints changed/
	);
});

test('accepts only the exact runtime and type-only public symbol manifest', () => {
	const exact = structuredClone(publicApiManifest);
	assert.doesNotThrow(() => assertPublicApiSymbols(exact));

	const missingType = structuredClone(publicApiManifest);
	missingType['./react'].typeOnly = missingType['./react'].typeOnly.filter(
		(symbol) => symbol !== 'SpektralErrorReport'
	);
	assert.throws(() => assertPublicApiSymbols(missingType), /\.\/react type-only exports changed/);

	const accidentalRuntime = structuredClone(publicApiManifest);
	accidentalRuntime['./vue'].runtime.push('InternalPortal');
	accidentalRuntime['./vue'].runtime.sort();
	assert.throws(() => assertPublicApiSymbols(accidentalRuntime), /\.\/vue runtime exports changed/);
});

test('does not expose compatibility aliases for the previous public identity', () => {
	const forbiddenIdentity = /MotionGPU|motiongpu|motion-gpu|@motion-core\/motion-gpu/;
	for (const [entrypoint, symbols] of Object.entries(publicApiManifest)) {
		assert.doesNotMatch(
			[...symbols.runtime, ...symbols.typeOnly].join('\n'),
			forbiddenIdentity,
			`${entrypoint} retained a legacy public symbol`
		);
	}
});

test('generates peer-specific compile contracts from the same manifest', () => {
	const coreContract = createPublicApiCompileContract('core');
	assert.match(coreContract, /RenderGraphSnapshot as Root_RenderGraphSnapshot/);
	assert.match(coreContract, /SpektralGraph as Core_SpektralGraph/);

	const reactContract = createPublicApiCompileContract('react');
	assert.match(reactContract, /SpektralErrorReport as React_SpektralErrorReport/);
	assert.match(reactContract, /ColorPipelineOptions as React_ColorPipelineOptions/);
	assert.match(reactContract, /RenderGraphSnapshot as React_RenderGraphSnapshot/);
	assert.match(reactContract, /SpektralGraph as ReactAdvanced_SpektralGraph/);
	assert.doesNotMatch(reactContract, /TextureOptionsInput/);

	const svelteContract = createPublicApiCompileContract('svelte');
	assert.match(svelteContract, /TextureOptionsInput as Svelte_TextureOptionsInput/);
	assert.match(svelteContract, /RenderGraphSnapshot as Svelte_RenderGraphSnapshot/);
	assert.match(svelteContract, /spektral\/svelte\/advanced/);

	const vueContract = createPublicApiCompileContract('vue');
	assert.match(vueContract, /RenderGraphSnapshot as Vue_RenderGraphSnapshot/);
	assert.match(vueContract, /SpektralGraph as VueAdvanced_SpektralGraph/);
	assert.throws(() => createPublicApiCompileContract('unknown'), /Unknown public API fixture/);
});

test('generates direct SSR imports for all public entrypoints without browser globals', () => {
	assert.ok(Object.isFrozen(nodeSsrEntrypoints));
	assert.deepEqual(nodeSsrEntrypoints, [
		'spektral',
		'spektral/advanced',
		'spektral/core',
		'spektral/core/advanced',
		'spektral/react',
		'spektral/react/advanced',
		'spektral/svelte',
		'spektral/svelte/advanced',
		'spektral/vue',
		'spektral/vue/advanced'
	]);
	assert.deepEqual(Object.keys(nodeSsrEntrypointsByFixture), ['core', 'react', 'svelte', 'vue']);
	const contract = createNodeSsrImportContract();
	for (const globalName of ['navigator', 'document', 'window']) {
		assert.match(contract, new RegExp(`['"]${globalName}['"]`));
	}
	assert.match(contract, /await import\(entrypoint\)/);
	assert.match(contract, /assertRuntimePublicApi\(entrypoint, namespace/);
	for (const entrypoint of nodeSsrEntrypoints) {
		assert.match(contract, new RegExp(JSON.stringify(entrypoint).replaceAll('/', '\\/')));
	}
	const loader = createNodeSsrLoader();
	assert.match(loader, /svelte\/compiler/);
	assert.match(loader, /generate: 'server'/);
	assert.match(loader, /ERR_MODULE_NOT_FOUND/);
	assert.match(loader, /`\$\{specifier\}\.js`/);
	assert.match(loader, /url\.endsWith\('\.css'\)/);
});

test('rejects emitted JavaScript missing a declared runtime export', () => {
	assert.doesNotThrow(() =>
		assertRuntimePublicApi('spektral/core', { present: true }, ['present'])
	);
	assert.throws(
		() => assertRuntimePublicApi('spektral/core', { present: true }, ['missing', 'present']),
		/Missing: missing/
	);
});

test('core fixture compiles and runs a structural custom RenderPass contract', async () => {
	const fixtureSource = await readFile(
		new URL('./fixtures/core/src/custom-render-pass.ts', import.meta.url),
		'utf8'
	);
	const fixtureManifest = JSON.parse(
		await readFile(new URL('./fixtures/core/package.json', import.meta.url), 'utf8')
	);
	assert.match(fixtureSource, /import type \{ AnyPass, RenderPass \}/);
	assert.match(fixtureSource, /satisfies RenderPass/);
	assert.match(fixtureSource, /const acceptedPasses: AnyPass\[\] = \[structuralCustomRenderPass\]/);
	assert.match(fixtureSource, /structuralCustomRenderPass\.render\(\)/);
	assert.equal(fixtureManifest.scripts['test:custom-pass'], 'node src/custom-render-pass.ts');
	assert.equal(fixtureManifest.engines.node, '>=22.18.0');
});

test('core fixture proves readonly contracts while accepting mutable inputs', async () => {
	const fixtureSource = await readFile(
		new URL('./fixtures/core/src/readonly-contract.ts', import.meta.url),
		'utf8'
	);
	for (const contract of [
		'TypedUniform',
		"TypedUniform<'vec2f'>['value']",
		'TextureData',
		'TextureDefinition',
		'StorageBufferDefinition'
	]) {
		assert.match(fixtureSource, new RegExp(contract.replaceAll('[', '\\[').replaceAll(']', '\\]')));
	}
	assert.match(fixtureSource, /mutableTypedUniformInput satisfies TypedUniform/);
	assert.match(fixtureSource, /mutableInitialData/);
	assert.equal(fixtureSource.match(/@ts-expect-error/g)?.length, 8);
});

test('Svelte fixture passes a structural custom RenderPass through FragCanvas', async () => {
	const fixtureSource = await readFile(
		new URL('./fixtures/svelte/src/App.svelte', import.meta.url),
		'utf8'
	);
	assert.match(fixtureSource, /satisfies RenderPass/);
	assert.match(fixtureSource, /dataset\.packedCustomRenderPass = 'executed'/);
	assert.match(fixtureSource, /<FragCanvas \{material\} \{passes\} \/>/);
});

test('pins only declared fixture dependencies without mutating the template', () => {
	const template = {
		dependencies: { react: '^19.0.0' },
		devDependencies: { '@types/react': '^19.0.0' }
	};
	assert.deepEqual(applyExactVersions(template, { react: '19.0.0' }), {
		dependencies: { react: '19.0.0' },
		devDependencies: { '@types/react': '^19.0.0' }
	});
	assert.equal(template.dependencies.react, '^19.0.0');
	assert.throws(
		() => applyExactVersions(template, { 'react-dom': '19.0.0' }),
		/Cannot pin undeclared fixture dependency react-dom/
	);
});

test('keeps global Node declarations aligned inside each shared fixture workspace', () => {
	assert.doesNotThrow(() =>
		assertSharedNodeTypesAligned({
			next: { '@types/node': '22.15.3' },
			vue: { '@types/node': '22.15.3' }
		})
	);
	assert.throws(
		() =>
			assertSharedNodeTypesAligned({
				next: { '@types/node': '22.15.3' },
				vue: { '@types/node': '25.8.0' }
			}),
		/one @types\/node version per profile/
	);
});

test('requires bundled source navigation to embedded Spektral library sources', () => {
	assert.equal(
		assertBundledSourceNavigation(
			[
				{
					file: 'assets/index.js.map',
					source: JSON.stringify({
						version: 3,
						sources: ['../../node_modules/spektral/src/lib/core/material.ts', '../../src/main.ts'],
						sourcesContent: ['export const material = true;', 'export const app = true;']
					})
				}
			],
			'react'
		),
		1
	);
	assert.equal(
		assertBundledSourceNavigation(
			[
				{
					file: 'static/chunks/app.js.map',
					source: JSON.stringify({
						version: 3,
						sources: [
							'webpack://_N_E/../../../src/lib/framework/router.ts',
							'webpack://_N_E/../../src/lib/core/material.ts'
						],
						sourcesContent: ['export const nextInternal = true;', 'export const material = true;']
					})
				}
			],
			'next'
		),
		1
	);
	assert.throws(
		() =>
			assertBundledSourceNavigation(
				[
					{
						file: 'assets/index.js.map',
						source: JSON.stringify({
							version: 3,
							sources: ['../../node_modules/spektral/src/lib/core/material.ts'],
							sourcesContent: []
						})
					}
				],
				'next'
			),
		/omitted sourcesContent/
	);
	assert.throws(
		() =>
			assertBundledSourceNavigation(
				[
					{
						file: 'assets/index.js.map',
						source: JSON.stringify({
							version: 3,
							sources: ['../../src/main.ts'],
							sourcesContent: ['export const app = true;']
						})
					}
				],
				'vue'
			),
		/no source-navigation path/
	);
});

test('passes published Spektral maps into the real Vite transform pipeline', async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spektral-vite-source-map-'));
	try {
		const modulePath = path.join(
			temporaryRoot,
			'node_modules',
			'spektral',
			'dist',
			'core',
			'material.js'
		);
		await mkdir(path.dirname(modulePath), { recursive: true });
		const sourceMap = {
			version: 3,
			sources: ['../../src/lib/core/material.ts'],
			sourcesContent: ['export const material = true;'],
			names: [],
			mappings: ''
		};
		await writeFile(modulePath, 'export const material = true;');
		await writeFile(`${modulePath}.map`, JSON.stringify(sourceMap));
		const plugin = preserveSpektralSourceMaps();
		assert.equal(plugin.name, 'preserve-published-spektral-source-maps');
		assert.equal(plugin.enforce, 'pre');
		assert.deepEqual(await plugin.load(`${modulePath}?v=1`), {
			code: 'export const material = true;',
			map: sourceMap
		});
		assert.equal(await plugin.load(path.join(temporaryRoot, 'src/main.js')), null);
	} finally {
		await rm(temporaryRoot, { force: true, recursive: true });
	}
});

test('reports the explicit pass-through hook contract for rebundled source navigation', () => {
	assert.match(rebundledSourceMapContract, /explicit pass-through map-chain hook/);
	assert.match(rebundledSourceMapContract, /direct published maps and Node stacks require no hook/);
});

test('passes published Spektral maps into the real Next webpack pipeline', async () => {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spektral-next-source-map-'));
	try {
		const modulePath = path.join(temporaryRoot, 'material.js');
		const sourceMap = {
			version: 3,
			sources: ['../../src/lib/core/material.ts'],
			sourcesContent: ['export const material = true;'],
			names: [],
			mappings: ''
		};
		await writeFile(`${modulePath}.map`, JSON.stringify(sourceMap));
		const loader = (await import('./fixtures/next/spektral-source-map-loader.cjs')).default;
		const result = await new Promise((resolve, reject) => {
			loader.call(
				{
					async: () => (error, code, map) => (error ? reject(error) : resolve({ code, map })),
					cacheable: () => {},
					resourcePath: modulePath
				},
				'export const material = true;',
				null
			);
		});
		assert.deepEqual(result, {
			code: 'export const material = true;',
			map: sourceMap
		});
	} finally {
		await rm(temporaryRoot, { force: true, recursive: true });
	}
});

test('all rebundling fixtures explicitly chain published Spektral maps', async () => {
	const helperDeclaration = await readFile(
		new URL('./fixtures/vite-spektral-source-maps.d.mts', import.meta.url),
		'utf8'
	);
	assert.match(
		helperDeclaration,
		/preserveSpektralSourceMaps\(\): PublishedSpektralSourceMapPlugin/
	);
	assert.doesNotMatch(helperDeclaration, /from ['"]vite['"]/);
	for (const fixtureName of ['core', 'react', 'svelte', 'sveltekit', 'vue']) {
		const config = await readFile(
			new URL(`./fixtures/${fixtureName}/vite.config.ts`, import.meta.url),
			'utf8'
		);
		assert.match(config, /preserveSpektralSourceMaps/);
		assert.match(config, /plugins:\s*\[preserveSpektralSourceMaps\(\)/);
	}
	const nextConfig = await readFile(
		new URL('./fixtures/next/next.config.mjs', import.meta.url),
		'utf8'
	);
	assert.match(nextConfig, /productionBrowserSourceMaps:\s*true/);
	assert.match(nextConfig, /spektral-source-map-loader\.cjs/);
	assert.match(nextConfig, /node_modules\[\\\\\/\]spektral/);
});

test('Next fixture keeps production-build rewrites inside the isolated copy', async () => {
	const [manifest, tsconfig] = await Promise.all([
		readFile(new URL('./fixtures/next/package.json', import.meta.url), 'utf8').then(JSON.parse),
		readFile(new URL('./fixtures/next/tsconfig.json', import.meta.url), 'utf8').then(JSON.parse)
	]);
	assert.equal(manifest.devDependencies['@types/node'], '^22.0.0');
	assert.equal(tsconfig.compilerOptions.jsx, 'preserve');
	assert.doesNotMatch(JSON.stringify(tsconfig.include), /\.next\/dev\/types/);
});

test('package build minifies the ten public entries while preserving external source maps', async () => {
	const config = await readFile(new URL('../../vite.package.config.ts', import.meta.url), 'utf8');
	assert.match(config, /sourcemap:\s*true/);
	assert.match(config, /minify:\s*['"]oxc['"]/);
	assert.match(config, /compress:\s*true/);
	assert.match(config, /mangle:\s*true/);
	assert.match(config, /removeWhitespace:\s*true/);
	assert.match(config, /preserveModules:\s*true/);
	assert.match(config, /\.\.\.publicEntryPaths, \.\.\.rawSvelteRuntimeEntryPaths/);
	assert.doesNotMatch(config, /collectScriptEntryPoints/);
	assert.match(config, /prune-unreachable-dts\.mjs/);
	assert.match(config, /deduplicate-vue-facade-maps\.mjs/);
});
