import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	assertPackedArtifactMetadata,
	assertRegistryPublication,
	assertReleaseEvent,
	assertReleaseIdentity,
	classifyNpmViewResult,
	EXPECTED_GITHUB_REPOSITORY,
	EXPECTED_PACKAGE_NAME,
	EXPECTED_REPOSITORY_DIRECTORY,
	EXPECTED_REPOSITORY_URL,
	parseCanonicalReleaseTag,
	resolveSinglePackedTarball
} from './release-contract.mjs';

const packageManifest = {
	name: EXPECTED_PACKAGE_NAME,
	version: '0.16.0',
	repository: {
		type: 'git',
		url: EXPECTED_REPOSITORY_URL,
		directory: EXPECTED_REPOSITORY_DIRECTORY
	},
	publishConfig: { access: 'public' }
};

const packManifest = {
	...packageManifest,
	types: './dist/index.d.ts',
	exports: {
		'.': { types: './dist/index.d.ts', default: './dist/index.js' },
		'./svelte': {
			types: './dist/svelte/index.d.ts',
			svelte: './dist/svelte/index.js',
			default: './dist/svelte/index.js'
		}
	}
};

const packedFiles = [
	'LICENSE',
	'README.md',
	'package.json',
	'dist/spektral.css',
	'dist/index.d.ts',
	'dist/index.js',
	'dist/svelte/FragCanvas.svelte',
	'dist/svelte/index.d.ts',
	'dist/svelte/index.js'
].map((filePath) => ({ mode: 0o644, path: filePath, size: 1 }));

const packMetadata = [
	{
		entryCount: packedFiles.length,
		filename: 'spektral-0.16.0.tgz',
		files: packedFiles,
		id: 'spektral@0.16.0',
		integrity: 'sha512-exact',
		name: 'spektral',
		shasum: '1234567890abcdef1234567890abcdef12345678',
		size: 100,
		unpackedSize: 200,
		version: '0.16.0'
	}
];

test('accepts only canonical stable release tags', () => {
	assert.equal(parseCanonicalReleaseTag('v0.16.0'), '0.16.0');
	for (const tag of ['0.16.0', 'v0.16', 'v01.16.0', 'v0.16.0-rc.1', 'v0.16.0+build']) {
		assert.throws(() => parseCanonicalReleaseTag(tag), /canonical|stable/);
	}
});

test('rejects non-published, draft, and prerelease release events', () => {
	const event = {
		action: 'published',
		release: { draft: false, prerelease: false, tag_name: 'v0.16.0' }
	};
	assert.equal(assertReleaseEvent(event), '0.16.0');
	assert.throws(() => assertReleaseEvent({ ...event, action: 'created' }), /published/);
	assert.throws(
		() => assertReleaseEvent({ ...event, release: { ...event.release, draft: true } }),
		/Draft/
	);
	assert.throws(
		() => assertReleaseEvent({ ...event, release: { ...event.release, prerelease: true } }),
		/Prereleases/
	);
});

test('requires exact package and GitHub repository identity', () => {
	assert.doesNotThrow(() =>
		assertReleaseIdentity({
			githubRepository: EXPECTED_GITHUB_REPOSITORY,
			manifest: packageManifest,
			version: '0.16.0'
		})
	);
	assert.throws(
		() =>
			assertReleaseIdentity({
				githubRepository: 'fork/spektral',
				manifest: packageManifest,
				version: '0.16.0'
			}),
		/kaltwrk\/spektral/
	);
	assert.throws(
		() =>
			assertReleaseIdentity({
				githubRepository: EXPECTED_GITHUB_REPOSITORY,
				manifest: { ...packageManifest, version: '0.15.1' },
				version: '0.16.0'
			}),
		/does not match/
	);
	assert.throws(
		() =>
			assertReleaseIdentity({
				githubRepository: EXPECTED_GITHUB_REPOSITORY,
				manifest: {
					...packageManifest,
					repository: { ...packageManifest.repository, url: 'https://example.com/repo.git' }
				},
				version: '0.16.0'
			}),
		/repository must be exactly/
	);
});

test('distinguishes an absent npm version from network and registry failures', () => {
	assert.equal(classifyNpmViewResult({ exitCode: 0, stdout: '"0.16.0"' }), 'published');
	assert.equal(
		classifyNpmViewResult({ exitCode: 1, stderr: 'npm error code E404' }),
		'unpublished'
	);
	assert.equal(
		classifyNpmViewResult({ exitCode: 1, stderr: 'npm error code ECONNRESET' }),
		'indeterminate'
	);
});

test('selects one exact packed tarball and rejects ambiguous directories', () => {
	assert.equal(
		resolveSinglePackedTarball('/tmp/artifacts', ['notes.txt', 'spektral-0.16.0.tgz']),
		'/tmp/artifacts/spektral-0.16.0.tgz'
	);
	assert.throws(() => resolveSinglePackedTarball('/tmp/artifacts', []), /found 0/);
	assert.throws(
		() => resolveSinglePackedTarball('/tmp/artifacts', ['first.tgz', 'second.tgz']),
		/found 2/
	);
});

test('accepts only exact, complete npm pack metadata', () => {
	assert.equal(
		assertPackedArtifactMetadata({
			manifest: packManifest,
			metadata: packMetadata,
			version: '0.16.0'
		}).filename,
		'spektral-0.16.0.tgz'
	);
	assert.throws(
		() =>
			assertPackedArtifactMetadata({
				manifest: packManifest,
				metadata: [{ ...packMetadata[0], version: '0.15.1' }],
				version: '0.16.0'
			}),
		/exact package name, version, and filename/
	);
	assert.throws(
		() =>
			assertPackedArtifactMetadata({
				manifest: packManifest,
				metadata: [{ ...packMetadata[0], entryCount: packedFiles.length + 1 }],
				version: '0.16.0'
			}),
		/entryCount/
	);
	assert.throws(
		() =>
			assertPackedArtifactMetadata({
				manifest: packManifest,
				metadata: [
					{
						...packMetadata[0],
						entryCount: packedFiles.length - 1,
						files: packedFiles.filter(({ path: filePath }) => filePath !== 'dist/index.js')
					}
				],
				version: '0.16.0'
			}),
		/missing required file "dist\/index\.js"/
	);
	assert.throws(
		() =>
			assertPackedArtifactMetadata({
				manifest: packManifest,
				metadata: [
					{
						...packMetadata[0],
						entryCount: packedFiles.length + 1,
						files: [...packedFiles, { mode: 0o644, path: 'docs/release.md', size: 1 }]
					}
				],
				version: '0.16.0'
			}),
		/repository-only files/
	);
});

test('requires exact latest, integrity, and npm provenance registry metadata', () => {
	const publication = {
		expectedIntegrity: 'sha512-exact',
		tags: { latest: '0.16.0' },
		version: '0.16.0',
		versionDocument: {
			name: EXPECTED_PACKAGE_NAME,
			version: '0.16.0',
			dist: {
				integrity: 'sha512-exact',
				attestations: {
					url: 'https://registry.npmjs.org/-/npm/v1/attestations/example',
					provenance: { predicateType: 'https://slsa.dev/provenance/v1' }
				}
			}
		}
	};
	assert.equal(
		assertRegistryPublication(publication),
		'https://registry.npmjs.org/-/npm/v1/attestations/example'
	);
	assert.throws(
		() => assertRegistryPublication({ ...publication, tags: { latest: '0.15.1' } }),
		/dist-tag latest/
	);
	assert.throws(
		() =>
			assertRegistryPublication({
				...publication,
				versionDocument: {
					...publication.versionDocument,
					dist: { ...publication.versionDocument.dist, integrity: 'sha512-other' }
				}
			}),
		/integrity/
	);
	assert.throws(
		() =>
			assertRegistryPublication({
				...publication,
				versionDocument: {
					...publication.versionDocument,
					dist: { integrity: 'sha512-exact' }
				}
			}),
		/provenance/
	);
	assert.throws(
		() =>
			assertRegistryPublication({
				...publication,
				versionDocument: {
					...publication.versionDocument,
					dist: {
						...publication.versionDocument.dist,
						attestations: {
							...publication.versionDocument.dist.attestations,
							url: 'https://example.com/attestations/package'
						}
					}
				}
			}),
		/provenance/
	);
});
