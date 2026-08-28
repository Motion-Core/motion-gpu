import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	applyExactVersions,
	assertPublicApiSymbols,
	assertPublicExportMap,
	createPublicApiCompileContract,
	injectTarballPath
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
