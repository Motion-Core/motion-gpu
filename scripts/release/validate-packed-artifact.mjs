import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { assertPackedArtifactMetadata, parseCanonicalReleaseTag } from './release-contract.mjs';

const [metadataPath, artifactDirectory, version] = process.argv.slice(2);
if (!metadataPath || !artifactDirectory || !version) {
	throw new Error(
		'Usage: node validate-packed-artifact.mjs <npm-pack-json> <artifact-directory> <version>.'
	);
}
parseCanonicalReleaseTag(`v${version}`);

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(
	await readFile(path.join(repositoryRoot, 'packages/spektral/package.json'), 'utf8')
);
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const artifact = assertPackedArtifactMetadata({ manifest, metadata, version });
const tarballPath = path.resolve(artifactDirectory, artifact.filename);
const tarballStat = await stat(tarballPath);
if (!tarballStat.isFile() || tarballStat.size !== artifact.size) {
	throw new Error(
		`Packed tarball size ${tarballStat.size} does not match npm pack metadata size ${artifact.size}.`
	);
}

process.stdout.write(`tarball=${tarballPath}\nmetadata=${path.resolve(metadataPath)}\n`);
