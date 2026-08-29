import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
	applyExactVersions,
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
	parsePackedConsumerArguments
} from './packed-consumers.mjs';
import { publicApiManifest } from './public-api-manifest.mjs';

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
		injectTarballPath('{"package":"file:__MOTION_GPU_TARBALL__"}', '/tmp/package.tgz'),
		'{"package":"file:/tmp/package.tgz"}'
	);
	assert.throws(() => injectTarballPath('{}', '/tmp/package.tgz'), /found 0/);
	assert.throws(
		() =>
			injectTarballPath(
				'{"first":"__MOTION_GPU_TARBALL__","second":"__MOTION_GPU_TARBALL__"}',
				'/tmp/package.tgz'
			),
		/found 2/
	);
});

test('accepts only absolute tarballs or exact stable package versions', () => {
	assert.deepEqual(parsePackageSpec('/tmp/motion-gpu.tgz'), {
		dependencySpec: 'file:/tmp/motion-gpu.tgz',
		expectedVersion: undefined,
		type: 'tarball'
	});
	assert.deepEqual(parsePackageSpec('0.16.0'), {
		dependencySpec: '0.16.0',
		expectedVersion: '0.16.0',
		type: 'version'
	});
	for (const invalid of [
		'./motion-gpu.tgz',
		'^0.16.0',
		'0.16.0-rc.1',
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
	const template = '{"package":"file:__MOTION_GPU_TARBALL__"}';
	assert.equal(
		injectPackageSpec(template, 'file:/tmp/package.tgz'),
		'{"package":"file:/tmp/package.tgz"}'
	);
	assert.equal(injectPackageSpec(template, '0.16.0'), '{"package":"0.16.0"}');
	assert.throws(() => injectPackageSpec('{}', '0.16.0'), /found 0/);
});

test('parses package spec and peer matrix CLI options without ambiguity', () => {
	assert.deepEqual(
		parsePackedConsumerArguments([
			'--browser-runtime',
			'--peer-matrix',
			'--package-spec',
			'/tmp/motion-gpu.tgz'
		]),
		{
			includeBrowserRuntime: true,
			includeMinimumPeers: true,
			packageSpec: '/tmp/motion-gpu.tgz'
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
		(symbol) => symbol !== 'MotionGPUErrorReport'
	);
	assert.throws(() => assertPublicApiSymbols(missingType), /\.\/react type-only exports changed/);

	const accidentalRuntime = structuredClone(publicApiManifest);
	accidentalRuntime['./vue'].runtime.push('InternalPortal');
	accidentalRuntime['./vue'].runtime.sort();
	assert.throws(() => assertPublicApiSymbols(accidentalRuntime), /\.\/vue runtime exports changed/);
});

test('generates peer-specific compile contracts from the same manifest', () => {
	const reactContract = createPublicApiCompileContract('react');
	assert.match(reactContract, /MotionGPUErrorReport as React_MotionGPUErrorReport/);
	assert.match(reactContract, /ColorPipelineOptions as React_ColorPipelineOptions/);
	assert.doesNotMatch(reactContract, /TextureOptionsInput/);

	const svelteContract = createPublicApiCompileContract('svelte');
	assert.match(svelteContract, /TextureOptionsInput as Svelte_TextureOptionsInput/);
	assert.match(svelteContract, /@motion-core\/motion-gpu\/svelte\/advanced/);
	assert.throws(() => createPublicApiCompileContract('unknown'), /Unknown public API fixture/);
});

test('generates direct SSR imports for all public entrypoints without browser globals', () => {
	assert.ok(Object.isFrozen(nodeSsrEntrypoints));
	assert.deepEqual(nodeSsrEntrypoints, [
		'@motion-core/motion-gpu',
		'@motion-core/motion-gpu/advanced',
		'@motion-core/motion-gpu/core',
		'@motion-core/motion-gpu/core/advanced',
		'@motion-core/motion-gpu/react',
		'@motion-core/motion-gpu/react/advanced',
		'@motion-core/motion-gpu/svelte',
		'@motion-core/motion-gpu/svelte/advanced',
		'@motion-core/motion-gpu/vue',
		'@motion-core/motion-gpu/vue/advanced'
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
		assertRuntimePublicApi('@motion-core/motion-gpu/core', { present: true }, ['present'])
	);
	assert.throws(
		() =>
			assertRuntimePublicApi('@motion-core/motion-gpu/core', { present: true }, [
				'missing',
				'present'
			]),
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
