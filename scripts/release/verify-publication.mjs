import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
	assertRegistryPublication,
	EXPECTED_PACKAGE_NAME,
	NPM_REGISTRY_URL,
	parseCanonicalReleaseTag
} from './release-contract.mjs';

const [version, tarballPath] = process.argv.slice(2);
if (!version || !tarballPath) {
	throw new Error('Usage: node verify-publication.mjs <version> <published-tarball>.');
}
parseCanonicalReleaseTag(`v${version}`);

const tarball = await readFile(tarballPath);
const expectedIntegrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
const packagePath = encodeURIComponent(EXPECTED_PACKAGE_NAME);
const versionUrl = `${NPM_REGISTRY_URL}/${packagePath}/${version}`;
const tagsUrl = `${NPM_REGISTRY_URL}/-/package/${packagePath}/dist-tags`;
const REGISTRY_ATTEMPT_TIMEOUT_MS = 30_000;
let lastError;

for (let attempt = 1; attempt <= 30; attempt += 1) {
	const controller = new AbortController();
	try {
		const signal = AbortSignal.any([
			controller.signal,
			AbortSignal.timeout(REGISTRY_ATTEMPT_TIMEOUT_MS)
		]);
		const [versionResponse, tagsResponse] = await Promise.all([
			fetch(versionUrl, { headers: { accept: 'application/json' }, signal }),
			fetch(tagsUrl, { headers: { accept: 'application/json' }, signal })
		]);
		if (!versionResponse.ok || !tagsResponse.ok) {
			throw new Error(
				`Registry returned HTTP ${versionResponse.status} for the version and ${tagsResponse.status} for dist-tags.`
			);
		}

		const versionDocument = await versionResponse.json();
		const attestationUrl = assertRegistryPublication({
			expectedIntegrity,
			tags: await tagsResponse.json(),
			version,
			versionDocument
		});
		const attestationResponse = await fetch(attestationUrl, {
			headers: { accept: 'application/json' },
			signal
		});
		if (!attestationResponse.ok) {
			throw new Error(
				`Registry returned HTTP ${attestationResponse.status} for the provenance attestation.`
			);
		}
		await attestationResponse.json();
		console.log(
			`Verified ${EXPECTED_PACKAGE_NAME}@${version}: latest, tarball integrity, and available provenance attestation.`
		);
		process.exit(0);
	} catch (error) {
		controller.abort();
		lastError = error;
		console.error(
			`Registry verification attempt ${attempt}/30 is not ready: ${error instanceof Error ? error.message : String(error)}`
		);
		if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 10_000));
	}
}

throw lastError;
