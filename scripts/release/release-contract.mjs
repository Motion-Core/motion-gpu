import path from 'node:path';

export const EXPECTED_PACKAGE_NAME = 'spektral';
export const EXPECTED_GITHUB_REPOSITORY = 'kaltwrk/spektral';
export const EXPECTED_REPOSITORY_URL = `https://github.com/${EXPECTED_GITHUB_REPOSITORY}`;
export const EXPECTED_REPOSITORY_DIRECTORY = 'packages/spektral';
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseCanonicalReleaseTag(tag) {
	if (typeof tag !== 'string' || !tag.startsWith('v')) {
		throw new Error(
			`Release tag must use the canonical vX.Y.Z form; received ${JSON.stringify(tag)}.`
		);
	}

	const version = tag.slice(1);
	if (!stableVersionPattern.test(version)) {
		throw new Error(
			`Release tag must identify a stable version in canonical vX.Y.Z form; received ${tag}.`
		);
	}

	return version;
}

export function assertReleaseEvent(event) {
	if (!event || typeof event !== 'object') {
		throw new Error('GitHub release event payload must be an object.');
	}
	if (event.action !== 'published') {
		throw new Error(`Release action must be published; received ${JSON.stringify(event.action)}.`);
	}
	if (!event.release || typeof event.release !== 'object') {
		throw new Error('GitHub release event payload is missing release metadata.');
	}
	if (event.release.draft !== false) {
		throw new Error('Draft releases cannot publish npm packages.');
	}
	if (event.release.prerelease !== false) {
		throw new Error('Prereleases cannot publish the stable npm package.');
	}

	return parseCanonicalReleaseTag(event.release.tag_name);
}

export function assertReleaseIdentity({ githubRepository, manifest, version }) {
	if (githubRepository !== EXPECTED_GITHUB_REPOSITORY) {
		throw new Error(
			`Release must run from ${EXPECTED_GITHUB_REPOSITORY}; received ${JSON.stringify(githubRepository)}.`
		);
	}
	if (manifest.name !== EXPECTED_PACKAGE_NAME) {
		throw new Error(
			`Package name must be ${EXPECTED_PACKAGE_NAME}; received ${JSON.stringify(manifest.name)}.`
		);
	}
	if (manifest.version !== version) {
		throw new Error(
			`Release tag version ${version} does not match package version ${JSON.stringify(manifest.version)}.`
		);
	}
	if (
		manifest.repository?.type !== 'git' ||
		manifest.repository?.url !== EXPECTED_REPOSITORY_URL ||
		manifest.repository?.directory !== EXPECTED_REPOSITORY_DIRECTORY
	) {
		throw new Error(
			`Package repository must be exactly ${EXPECTED_REPOSITORY_URL} with directory ${EXPECTED_REPOSITORY_DIRECTORY}.`
		);
	}
	if (manifest.publishConfig?.access !== 'public') {
		throw new Error('Package publishConfig.access must be public.');
	}
}

export function classifyNpmViewResult({ exitCode, stderr = '', stdout = '' }) {
	if (exitCode === 0) return 'published';

	const output = `${stdout}\n${stderr}`;
	if (/\bE404\b|404 Not Found|is not in this registry/i.test(output)) return 'unpublished';
	return 'indeterminate';
}

export function resolveSinglePackedTarball(directory, files) {
	const tarballs = files.filter((file) => file.endsWith('.tgz'));
	if (tarballs.length !== 1) {
		throw new Error(`Expected exactly one packed .tgz artifact; found ${tarballs.length}.`);
	}

	return path.resolve(directory, tarballs[0]);
}

export function assertPackedArtifactMetadata({ manifest, metadata, version }) {
	if (!Array.isArray(metadata) || metadata.length !== 1) {
		throw new Error(`npm pack must report exactly one artifact; found ${metadata?.length ?? 0}.`);
	}

	const artifact = metadata[0];
	const expectedFilename = `spektral-${version}.tgz`;
	if (
		artifact.id !== `${EXPECTED_PACKAGE_NAME}@${version}` ||
		artifact.name !== EXPECTED_PACKAGE_NAME ||
		artifact.version !== version ||
		artifact.filename !== expectedFilename
	) {
		throw new Error(
			'npm pack metadata does not match the exact package name, version, and filename.'
		);
	}
	if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) {
		throw new Error('npm pack metadata must report a positive tarball size.');
	}
	if (!Number.isSafeInteger(artifact.unpackedSize) || artifact.unpackedSize <= 0) {
		throw new Error('npm pack metadata must report a positive unpacked size.');
	}
	if (!Array.isArray(artifact.files) || artifact.files.length === 0) {
		throw new Error('npm pack metadata must list packaged files.');
	}
	if (artifact.entryCount !== artifact.files.length) {
		throw new Error(
			`npm pack entryCount ${artifact.entryCount} does not match files length ${artifact.files.length}.`
		);
	}
	if (!/^[a-f0-9]{40}$/.test(artifact.shasum)) {
		throw new Error('npm pack metadata must include a SHA-1 shasum.');
	}
	if (typeof artifact.integrity !== 'string' || !artifact.integrity.startsWith('sha512-')) {
		throw new Error('npm pack metadata must include SHA-512 integrity.');
	}

	const packagedPaths = new Set(
		artifact.files.map((file) => {
			if (typeof file?.path !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) {
				throw new Error('npm pack file metadata must contain a path and non-negative size.');
			}
			return file.path;
		})
	);
	const requiredPaths = new Set([
		'LICENSE',
		'README.md',
		'package.json',
		'dist/spektral.css',
		'dist/svelte/FragCanvas.svelte',
		manifest.types?.replace(/^\.\//, '')
	]);
	for (const exportTarget of Object.values(manifest.exports ?? {})) {
		if (!exportTarget || typeof exportTarget !== 'object') {
			throw new Error('Package exports must contain conditional target objects.');
		}
		for (const target of Object.values(exportTarget)) {
			if (typeof target !== 'string') {
				throw new Error('Every package export target must be a file path.');
			}
			requiredPaths.add(target.replace(/^\.\//, ''));
		}
	}
	for (const requiredPath of requiredPaths) {
		if (!requiredPath || !packagedPaths.has(requiredPath)) {
			throw new Error(`Packed artifact is missing required file ${JSON.stringify(requiredPath)}.`);
		}
	}

	const repositoryOnlyPattern =
		/^(?:\.github|benchmarks|coverage|docs|e2e|node_modules|scripts|src\/tests)(?:\/|$)|^(?:CHANGELOG\.md|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
	const repositoryOnlyFiles = [...packagedPaths].filter((file) => repositoryOnlyPattern.test(file));
	if (repositoryOnlyFiles.length > 0) {
		throw new Error(
			`Packed artifact contains repository-only files: ${repositoryOnlyFiles.join(', ')}.`
		);
	}

	return artifact;
}

export function assertRegistryPublication({ expectedIntegrity, tags, version, versionDocument }) {
	if (versionDocument?.name !== EXPECTED_PACKAGE_NAME) {
		throw new Error(
			`Registry returned the wrong package name: ${JSON.stringify(versionDocument?.name)}.`
		);
	}
	if (versionDocument?.version !== version) {
		throw new Error(`Registry has not exposed exact version ${version}.`);
	}
	if (tags?.latest !== version) {
		throw new Error(
			`Registry dist-tag latest is ${JSON.stringify(tags?.latest)}; expected ${version}.`
		);
	}
	if (versionDocument.dist?.integrity !== expectedIntegrity) {
		throw new Error(
			'Registry integrity does not match the exact tarball published by the workflow.'
		);
	}

	const attestations = versionDocument.dist?.attestations;
	const attestationUrlPrefix = `${NPM_REGISTRY_URL}/-/npm/v1/attestations/`;
	if (
		!attestations ||
		typeof attestations.url !== 'string' ||
		!attestations.url.startsWith(attestationUrlPrefix) ||
		attestations.provenance?.predicateType !== 'https://slsa.dev/provenance/v1'
	) {
		throw new Error('Registry has not exposed the expected npm provenance attestation.');
	}

	return attestations.url;
}
