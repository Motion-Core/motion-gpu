import { spawnSync } from 'node:child_process';
import {
	classifyNpmViewResult,
	EXPECTED_PACKAGE_NAME,
	NPM_REGISTRY_URL,
	parseCanonicalReleaseTag
} from './release-contract.mjs';

const [version] = process.argv.slice(2);
parseCanonicalReleaseTag(`v${version}`);

const result = spawnSync(
	'npm',
	[
		'view',
		`${EXPECTED_PACKAGE_NAME}@${version}`,
		'version',
		'--json',
		'--registry',
		NPM_REGISTRY_URL
	],
	{ encoding: 'utf8' }
);
if (result.error) throw result.error;

const classification = classifyNpmViewResult({
	exitCode: result.status,
	stderr: result.stderr,
	stdout: result.stdout
});
if (classification === 'published') {
	throw new Error(`${EXPECTED_PACKAGE_NAME}@${version} already exists and cannot be reused.`);
}
if (classification === 'indeterminate') {
	throw new Error(
		`Could not prove ${EXPECTED_PACKAGE_NAME}@${version} is unpublished. npm view failed with status ${result.status}: ${result.stderr || result.stdout}`
	);
}

console.log(`Confirmed ${EXPECTED_PACKAGE_NAME}@${version} is not present in npm.`);
