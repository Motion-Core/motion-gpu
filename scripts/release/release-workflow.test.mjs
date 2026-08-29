import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowPath = new URL('../../.github/workflows/release.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');
const publicationVerifier = await readFile(
	new URL('./verify-publication.mjs', import.meta.url),
	'utf8'
);
const rootManifest = JSON.parse(
	await readFile(new URL('../../package.json', import.meta.url), 'utf8')
);

function assertOrdered(stepNames) {
	let previousIndex = -1;
	for (const stepName of stepNames) {
		const index = workflow.indexOf(`- name: ${stepName}`);
		assert.ok(index > previousIndex, `${stepName} must exist after the preceding release step.`);
		previousIndex = index;
	}
}

test('runs only when a GitHub release is published', () => {
	assert.match(workflow, /on:\n  release:\n    types:\n      - published/);
	assert.doesNotMatch(workflow, /workflow_dispatch:|pull_request:|\n  push:/);
	assert.match(workflow, /preflight\.mjs "\$GITHUB_EVENT_PATH" "\$RELEASE_REPOSITORY"/);
});

test('uses the trusted-publishing runner, environment, and least privileges', () => {
	assert.match(workflow, /runs-on: ubuntu-24\.04/);
	assert.match(workflow, /timeout-minutes: 90/);
	assert.match(workflow, /environment: npm-production/);
	assert.match(workflow, /COREPACK_ENABLE_DOWNLOAD_PROMPT: 0/);
	assert.match(workflow, /NPM_CONFIG_REGISTRY: https:\/\/registry\.npmjs\.org/);
	assert.match(workflow, /permissions:\n      contents: read\n      id-token: write/);
	assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
	assert.match(workflow, /node-version: 22\.21\.1/);
	assert.match(workflow, /npm install --global npm@11\.19\.0/);
	assert.match(
		workflow,
		/PACKAGE_MANAGER_SPEC="\$\(node -p 'require\("\.\/package\.json"\)\.packageManager'\)"/
	);
	assert.match(workflow, /corepack install --global "\$PACKAGE_MANAGER_SPEC"/);
	assert.match(workflow, /test "\$\(pnpm --version\)" = "10\.24\.0"/);
	assert.equal(
		rootManifest.packageManager,
		'pnpm@10.24.0+sha512.01ff8ae71b4419903b65c60fb2dc9d34cf8bb6e06d03bde112ef38f7a34d6904c424ba66bea5cdcf12890230bf39f9580473140ed9c946fef328b6e5238a345a'
	);
});

test('pins every third-party action to an immutable commit', () => {
	const actions = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);
	assert.ok(actions.length > 0, 'Release workflow must use pinned setup actions.');
	for (const action of actions) {
		assert.match(action, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
	}
});

test('guards package identity, master ancestry, and one-time versions before packing', () => {
	assert.match(workflow, /preflight\.mjs "\$GITHUB_EVENT_PATH" "\$RELEASE_REPOSITORY"/);
	assert.match(
		workflow,
		/git merge-base --is-ancestor "\$TAG_COMMIT" refs\/remotes\/origin\/master/
	);
	assert.match(workflow, /assert-unpublished\.mjs "\$\{\{ steps\.release\.outputs\.version \}\}"/);
	assertOrdered([
		'Validate stable release identity',
		'Verify release tag commit is on master',
		'Verify npm version is unpublished',
		'Install dependencies from lockfile',
		'Audit high-severity dependencies',
		'Install Chromium for release E2E gates',
		'Run full release gate and build',
		'Pack the release artifact once'
	]);
	assert.match(workflow, /pnpm --dir apps\/web exec playwright install --with-deps chromium/);
	assert.match(workflow, /run: pnpm run ci/);
	assert.match(rootManifest.scripts['ci:quality'], /pnpm run test:release-tools/);
});

test('tests, dry-runs, and publishes the same exact tarball in order', () => {
	const artifactReference = '${{ steps.pack.outputs.tarball }}';
	assert.ok(
		workflow.split(artifactReference).length - 1 >= 4,
		'Packed artifact output must flow through smoke, dry-run, publish, and verification.'
	);
	assert.match(
		workflow,
		/packed-consumers\.mjs --peer-matrix --package-spec "\$\{\{ steps\.pack\.outputs\.tarball \}\}"/
	);
	assert.match(
		workflow,
		/npm pack --json --ignore-scripts --pack-destination "\$PACK_DIRECTORY" --workspace @motion-core\/motion-gpu > "\$PACK_METADATA"/
	);
	assert.match(workflow, /validate-packed-artifact\.mjs/);
	assert.match(
		workflow,
		/npm publish "\$\{\{ steps\.pack\.outputs\.tarball \}\}" --dry-run --access public --tag latest/
	);
	assert.match(
		workflow,
		/npm publish "\$\{\{ steps\.pack\.outputs\.tarball \}\}" --access public --tag latest/
	);
	assert.doesNotMatch(workflow, /--provenance/);
	assertOrdered([
		'Run full release gate and build',
		'Pack the release artifact once',
		'Smoke test exact tarball with current and minimum peers',
		'Dry-run exact tarball publication',
		'Publish exact tarball through npm trusted publishing',
		'Verify registry version, latest, integrity, and provenance'
	]);
});

test('verifies provenance and exact registry consumers after publication', () => {
	assert.match(
		workflow,
		/npm install --ignore-scripts --save-exact "@motion-core\/motion-gpu@\$PACKAGE_VERSION"/
	);
	assert.match(workflow, /npm audit signatures/);
	assert.match(
		workflow,
		/packed-consumers\.mjs --peer-matrix --package-spec "\$\{\{ steps\.release\.outputs\.version \}\}"/
	);
	assertOrdered([
		'Verify registry version, latest, integrity, and provenance',
		'Audit signatures after a fresh exact-version install',
		'Smoke test exact registry version with current and minimum peers'
	]);
	assert.match(workflow, /uses: actions\/upload-artifact@[a-f0-9]{40}/);
	assert.match(workflow, /path: \$\{\{ steps\.pack\.outputs\.metadata \}\}/);
	assert.match(publicationVerifier, /REGISTRY_ATTEMPT_TIMEOUT_MS = 30_000/);
	assert.match(publicationVerifier, /const controller = new AbortController\(\)/);
	assert.match(publicationVerifier, /AbortSignal\.any\(\[/);
	assert.match(publicationVerifier, /controller\.abort\(\)/);
	assert.match(
		publicationVerifier,
		/fetch\(versionUrl, \{ headers: \{ accept: 'application\/json' \}, signal \}\)/
	);
	assert.match(
		publicationVerifier,
		/fetch\(tagsUrl, \{ headers: \{ accept: 'application\/json' \}, signal \}\)/
	);
});
