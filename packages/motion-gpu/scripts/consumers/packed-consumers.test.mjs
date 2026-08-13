import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPublicExportMap, injectTarballPath } from './packed-consumers.mjs';

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
