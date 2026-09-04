import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const EXPECTED_PACKAGE_NAME = 'spektral';
export const EXPECTED_GITHUB_REPOSITORY = 'kaltwrk/spektral';
export const EXPECTED_REPOSITORY_URL = `https://github.com/${EXPECTED_GITHUB_REPOSITORY}`;
export const EXPECTED_REPOSITORY_DIRECTORY = 'packages/spektral';
export const EXPECTED_HOMEPAGE = 'https://spektral.madebyhex.com';
export const EXPECTED_BUGS_URL = `${EXPECTED_REPOSITORY_URL}/issues`;
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
export const MAX_UNPACKED_SIZE = 1_500_000;
export const expectedPackageSideEffects = [
	'**/*.css',
	'./dist/react/index.js',
	'./dist/svelte/index.js',
	'./dist/vue/index.js'
];

const exactPackageFiles = ['dist', '!dist/**/*.test.*', '!dist/**/*.spec.*'];
const exactRootArtifactFiles = new Set(['LICENSE', 'README.md', 'package.json']);
const allowedDistArtifactPattern =
	/^dist\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(?:\.js|\.js\.map|\.d\.ts|\.svelte|\.css)$/;
const legacyBrandPattern = /@motion-core\/motion-gpu|motion[ _-]?gpu/i;

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
	if (manifest.homepage !== EXPECTED_HOMEPAGE || manifest.bugs?.url !== EXPECTED_BUGS_URL) {
		throw new Error(
			`Package homepage and bugs URL must be exactly ${EXPECTED_HOMEPAGE} and ${EXPECTED_BUGS_URL}.`
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
	if (JSON.stringify(manifest.files) !== JSON.stringify(exactPackageFiles)) {
		throw new Error(
			`Package files must be exactly ${JSON.stringify(exactPackageFiles)}; src/lib and repository files cannot be published.`
		);
	}
	if (JSON.stringify(manifest.sideEffects) !== JSON.stringify(expectedPackageSideEffects)) {
		throw new Error(
			'Package sideEffects must preserve the published CSS file and exact adapter wrappers that import it.'
		);
	}
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
	if (artifact.unpackedSize >= MAX_UNPACKED_SIZE) {
		throw new Error(
			`Packed artifact unpacked size ${artifact.unpackedSize} must be below ${MAX_UNPACKED_SIZE} bytes.`
		);
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
	const forbiddenPaths = [...packagedPaths].filter(
		(file) =>
			(!exactRootArtifactFiles.has(file) && !allowedDistArtifactPattern.test(file)) ||
			legacyBrandPattern.test(file)
	);
	if (forbiddenPaths.length > 0) {
		throw new Error(
			`Packed artifact contains files outside the exact allowlist: ${forbiddenPaths.join(', ')}.`
		);
	}
	const javascriptMapPaths = [...packagedPaths].filter((file) => file.endsWith('.js.map'));
	if (javascriptMapPaths.length === 0) {
		throw new Error('Packed artifact must contain executable JavaScript source maps.');
	}
	for (const mapPath of javascriptMapPaths) {
		const javascriptPath = mapPath.slice(0, -'.map'.length);
		if (!packagedPaths.has(javascriptPath)) {
			throw new Error(`JavaScript source map ${mapPath} has no published ${javascriptPath}.`);
		}
	}
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
		/^(?:\.github|benchmarks|coverage|docs|e2e|node_modules|scripts|src)(?:\/|$)|^(?:CHANGELOG\.md|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
	const repositoryOnlyFiles = [...packagedPaths].filter((file) => repositoryOnlyPattern.test(file));
	if (repositoryOnlyFiles.length > 0) {
		throw new Error(
			`Packed artifact contains repository-only files: ${repositoryOnlyFiles.join(', ')}.`
		);
	}

	return artifact;
}

function readTarString(buffer, offset, length) {
	const end = buffer.indexOf(0, offset);
	return buffer.toString(
		'utf8',
		offset,
		end === -1 || end > offset + length ? offset + length : end
	);
}

function parseTarSize(buffer, offset) {
	const value = readTarString(buffer, offset, 12).trim();
	if (!/^[0-7]*$/.test(value)) {
		throw new Error(`Unsupported npm tar size field ${JSON.stringify(value)}.`);
	}
	return value === '' ? 0 : Number.parseInt(value, 8);
}

/** Reads regular files from the deterministic npm package tarball without extracting to disk. */
export async function readNpmTarballFiles(tarballPath) {
	const archive = gunzipSync(await readFile(tarballPath));
	const files = new Map();
	let offset = 0;

	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = readTarString(header, 0, 100);
		const prefix = readTarString(header, 345, 155);
		const archivePath = prefix ? `${prefix}/${name}` : name;
		const size = parseTarSize(header, 124);
		const type = readTarString(header, 156, 1);
		const contentStart = offset + 512;
		const contentEnd = contentStart + size;
		if (contentEnd > archive.length) {
			throw new Error(`Truncated npm tarball entry ${archivePath}.`);
		}

		if (type === '' || type === '0') {
			if (!archivePath.startsWith('package/')) {
				throw new Error(`npm tarball entry must live below package/: ${archivePath}.`);
			}
			const publishedPath = archivePath.slice('package/'.length);
			if (files.has(publishedPath)) {
				throw new Error(`npm tarball contains duplicate file ${publishedPath}.`);
			}
			files.set(publishedPath, Buffer.from(archive.subarray(contentStart, contentEnd)));
		}

		offset = contentStart + Math.ceil(size / 512) * 512;
	}

	return files;
}

/** Validates tarball text identity and executable maps after npm has produced the exact artifact. */
export function assertPackedArtifactContents({ archiveFiles, metadataFiles }) {
	if (!(archiveFiles instanceof Map)) {
		throw new Error('Packed archive files must be provided as a Map.');
	}
	const expectedPaths = metadataFiles.map(({ path: file }) => file).sort();
	const actualPaths = [...archiveFiles.keys()].sort();
	if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
		throw new Error('npm tarball contents do not exactly match npm pack file metadata.');
	}

	for (const [file, content] of archiveFiles) {
		const source = content.toString('utf8');
		if (legacyBrandPattern.test(source)) {
			throw new Error(`Packed artifact retains the previous public identity in ${file}.`);
		}
	}

	const javascriptMaps = [...archiveFiles].filter(([file]) => file.endsWith('.js.map'));
	if (javascriptMaps.length === 0) {
		throw new Error('Packed artifact contains no executable JavaScript source maps.');
	}
	for (const [mapPath, content] of javascriptMaps) {
		let sourceMap;
		try {
			sourceMap = JSON.parse(content.toString('utf8'));
		} catch {
			throw new Error(`JavaScript source map ${mapPath} is not valid JSON.`);
		}
		if (
			sourceMap.version !== 3 ||
			!Array.isArray(sourceMap.sources) ||
			sourceMap.sources.length === 0 ||
			!Array.isArray(sourceMap.sourcesContent) ||
			sourceMap.sourcesContent.length !== sourceMap.sources.length ||
			sourceMap.sourcesContent.some((source) => typeof source !== 'string')
		) {
			throw new Error(
				`JavaScript source map ${mapPath} must be version 3 with complete sourcesContent.`
			);
		}
		for (const source of sourceMap.sources) {
			if (
				typeof source !== 'string' ||
				source === '' ||
				/^[a-z]+:/i.test(source) ||
				!source.replaceAll('\\', '/').includes('src/lib/')
			) {
				throw new Error(`JavaScript source map ${mapPath} has a non-library source ${source}.`);
			}
		}

		const javascriptPath = mapPath.slice(0, -'.map'.length);
		const javascript = archiveFiles.get(javascriptPath)?.toString('utf8');
		const expectedComment = `//# sourceMappingURL=${path.posix.basename(mapPath)}`;
		if (!javascript?.includes(expectedComment)) {
			throw new Error(
				`Published JavaScript ${javascriptPath} does not reference its source map ${mapPath}.`
			);
		}
	}
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
