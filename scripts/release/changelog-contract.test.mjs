import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const changelog = await readFile(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');

function releaseSection(version) {
	const marker = `## [${version}]`;
	const start = changelog.indexOf(marker);
	assert.notEqual(start, -1, `CHANGELOG.md must contain ${marker}.`);
	const next = changelog.indexOf('\n## [', start + marker.length);
	return changelog.slice(start, next === -1 ? undefined : next);
}

test('0.17.0 records the complete breaking Spektral identity cut', () => {
	assert.match(changelog, /^# Changelog\n\nAll notable changes to Spektral/m);
	const release = releaseSection('0.17.0');

	for (const heading of ['Breaking', 'Added', 'Changed', 'Performance']) {
		assert.match(release, new RegExp(`^### ${heading}$`, 'm'));
	}

	for (const requiredContract of [
		'@motion-core/motion-gpu',
		'spektral',
		'MotionGPU',
		'Spektral',
		'createSpektralRuntimeLoop',
		'useSpektral',
		'spektralFrame',
		'spektralFragment',
		'spektralUniforms',
		'not included'
	]) {
		assert.ok(
			release.includes(requiredContract),
			`0.17.0 changelog must document ${JSON.stringify(requiredContract)}.`
		);
	}

	assert.doesNotMatch(release, /migration guide/i);
});

test('pre-0.17 history retains the original Motion GPU identity', () => {
	const previousRelease = releaseSection('0.16.0');
	assert.match(previousRelease, /MotionGPUError/);
	assert.match(releaseSection('0.14.0'), /motiongpuFragment/);
});
