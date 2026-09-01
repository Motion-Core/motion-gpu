import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
	CANDIDATE_BRANCH,
	CANDIDATE_FILENAME,
	OBSERVATION_DURATION_MS,
	candidatePaths,
	createCandidateRecord,
	readAcceptanceStatus,
	verifyCandidateRecord
} from './candidate-record.mjs';

const startedAt = new Date('2026-09-01T08:00:00.000Z');
const cleanGitState = {
	artifactDirectoryIgnored: true,
	branch: CANDIDATE_BRANCH,
	clean: true,
	commit: 'a'.repeat(40),
	tagsAtHead: []
};

function writeTarString(header, value, offset, length) {
	header.write(value, offset, Math.min(Buffer.byteLength(value), length), 'utf8');
}

function tarEntry(file, content) {
	const body = Buffer.from(content);
	const header = Buffer.alloc(512);
	writeTarString(header, `package/${file}`, 0, 100);
	writeTarString(header, '0000644\0', 100, 8);
	writeTarString(header, '0000000\0', 108, 8);
	writeTarString(header, '0000000\0', 116, 8);
	writeTarString(header, `${body.length.toString(8).padStart(11, '0')}\0`, 124, 12);
	writeTarString(header, '00000000000\0', 136, 12);
	header.fill(0x20, 148, 156);
	writeTarString(header, '0', 156, 1);
	writeTarString(header, 'ustar\0', 257, 6);
	const padding = Buffer.alloc(Math.ceil(body.length / 512) * 512 - body.length);
	return Buffer.concat([header, body, padding]);
}

async function fixture() {
	const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'spektral-candidate-'));
	const packageDirectory = path.join(repositoryRoot, 'packages', 'spektral');
	const sourceDirectory = path.join(repositoryRoot, 'pack-output');
	await Promise.all([
		mkdir(packageDirectory, { recursive: true }),
		mkdir(sourceDirectory, { recursive: true })
	]);
	const manifest = {
		name: 'spektral',
		version: '0.17.0',
		files: ['dist', '!dist/**/*.test.*', '!dist/**/*.spec.*'],
		sideEffects: [
			'**/*.css',
			'./dist/react/index.js',
			'./dist/svelte/index.js',
			'./dist/vue/index.js'
		],
		types: './dist/index.d.ts',
		exports: {
			'.': { types: './dist/index.d.ts', default: './dist/index.js' }
		}
	};
	await writeFile(
		path.join(packageDirectory, 'package.json'),
		`${JSON.stringify(manifest, null, 2)}\n`
	);

	const files = new Map([
		['LICENSE', 'MIT\n'],
		['README.md', '# Spektral\n'],
		['package.json', `${JSON.stringify(manifest)}\n`],
		['dist/spektral.css', '.spektral-canvas-wrap { display: block; }\n'],
		['dist/svelte/FragCanvas.svelte', '<canvas></canvas>\n'],
		['dist/index.d.ts', 'export declare const value: number;\n'],
		['dist/index.js', 'export const value = 1;\n//# sourceMappingURL=index.js.map\n'],
		[
			'dist/index.js.map',
			JSON.stringify({
				version: 3,
				file: 'index.js',
				sources: ['../src/lib/index.ts'],
				sourcesContent: ['export const value = 1;\n'],
				names: [],
				mappings: ''
			})
		]
	]);
	const tar = Buffer.concat([
		...[...files].map(([file, content]) => tarEntry(file, content)),
		Buffer.alloc(1024)
	]);
	const tarball = gzipSync(tar);
	const tarballPath = path.join(sourceDirectory, CANDIDATE_FILENAME);
	await writeFile(tarballPath, tarball);

	const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
	const shasum = createHash('sha1').update(tarball).digest('hex');
	const metadata = [
		{
			id: 'spektral@0.17.0',
			name: 'spektral',
			version: '0.17.0',
			filename: CANDIDATE_FILENAME,
			size: tarball.length,
			unpackedSize: [...files.values()].reduce(
				(total, content) => total + Buffer.byteLength(content),
				0
			),
			shasum,
			integrity,
			entryCount: files.size,
			files: [...files].map(([file, content]) => ({
				path: file,
				size: Buffer.byteLength(content),
				mode: 0o644
			}))
		}
	];
	const metadataPath = path.join(sourceDirectory, 'npm-pack.json');
	await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

	return { metadata, metadataPath, repositoryRoot, tarball, tarballPath };
}

async function createFixtureCandidate() {
	const current = await fixture();
	const created = await createCandidateRecord({
		clock: () => startedAt,
		gitState: cleanGitState,
		metadataPath: current.metadataPath,
		repositoryRoot: current.repositoryRoot,
		tarballPath: current.tarballPath
	});
	return { ...current, ...created };
}

test('creates one immutable local candidate record with exact npm and Git evidence', async () => {
	const current = await createFixtureCandidate();
	assert.deepEqual(await readFile(current.paths.artifact), current.tarball);
	assert.equal(current.record.package, 'spektral');
	assert.equal(current.record.version, '0.17.0');
	assert.equal(current.record.npmPack.integrity, current.metadata[0].integrity);
	assert.equal(current.record.artifact.npmShasum, current.metadata[0].shasum);
	assert.equal(current.record.artifact.fileCount, current.metadata[0].entryCount);
	assert.equal(current.record.git.commit, cleanGitState.commit);
	assert.equal(current.record.git.tag, null);
	assert.equal(current.record.builtAt, startedAt.toISOString());
	assert.equal(current.record.observationStart, startedAt.toISOString());
	assert.equal(
		current.record.earliestObservationEnd,
		new Date(startedAt.getTime() + OBSERVATION_DURATION_MS).toISOString()
	);
	assert.equal('accepted' in current.record, false);

	await assert.rejects(
		createCandidateRecord({
			clock: () => startedAt,
			gitState: cleanGitState,
			metadataPath: current.metadataPath,
			repositoryRoot: current.repositoryRoot,
			tarballPath: current.tarballPath
		}),
		/refusing to overwrite/
	);
});

test('create rejects dirty, wrong-branch, tagged, and non-ignored candidate states', async () => {
	for (const [field, value, expected] of [
		['clean', false, /clean/],
		['branch', 'master', /release\/0\.17\.0/],
		['tagsAtHead', ['v0.17.0'], /must not have/],
		['artifactDirectoryIgnored', false, /ignored/]
	]) {
		const current = await fixture();
		await assert.rejects(
			createCandidateRecord({
				clock: () => startedAt,
				gitState: { ...cleanGitState, [field]: value },
				metadataPath: current.metadataPath,
				repositoryRoot: current.repositoryRoot,
				tarballPath: current.tarballPath
			}),
			expected
		);
		await assert.rejects(readFile(candidatePaths(current.repositoryRoot).record), /ENOENT/);
	}
});

test('verify is read-only and reports the remaining observation time', async () => {
	const current = await createFixtureCandidate();
	const recordBefore = await readFile(current.paths.record);
	const artifactBefore = await readFile(current.paths.artifact);
	const verification = await verifyCandidateRecord({
		clock: () => new Date(startedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
		gitState: cleanGitState,
		requireAcceptance: false,
		repositoryRoot: current.repositoryRoot
	});
	assert.equal(verification.accepted, false);
	assert.equal(verification.acceptanceEligible, false);
	assert.equal(verification.remainingMs, 3 * 24 * 60 * 60 * 1000);
	assert.deepEqual(await readFile(current.paths.record), recordBefore);
	assert.deepEqual(await readFile(current.paths.artifact), artifactBefore);
});

test('verify rejects one-byte artifact drift and npm metadata or integrity drift', async () => {
	{
		const current = await createFixtureCandidate();
		const drifted = await readFile(current.paths.artifact);
		drifted[0] ^= 1;
		await writeFile(current.paths.artifact, drifted);
		await assert.rejects(
			verifyCandidateRecord({
				clock: () => startedAt,
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/integrity/
		);
	}

	{
		const current = await createFixtureCandidate();
		const record = JSON.parse(await readFile(current.paths.record, 'utf8'));
		record.npmPack.unpackedSize += 1;
		await writeFile(current.paths.record, `${JSON.stringify(record, null, 2)}\n`);
		await assert.rejects(
			verifyCandidateRecord({
				clock: () => startedAt,
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/unpacked size/
		);
	}

	{
		const current = await createFixtureCandidate();
		const record = JSON.parse(await readFile(current.paths.record, 'utf8'));
		record.npmPack.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
		await writeFile(current.paths.record, `${JSON.stringify(record, null, 2)}\n`);
		await assert.rejects(
			verifyCandidateRecord({
				clock: () => startedAt,
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/integrity/
		);
	}

	{
		const current = await createFixtureCandidate();
		const record = JSON.parse(await readFile(current.paths.record, 'utf8'));
		record.npmPack.files[0].size += 1;
		await writeFile(current.paths.record, `${JSON.stringify(record, null, 2)}\n`);
		await assert.rejects(
			verifyCandidateRecord({
				acceptanceStatus: 'accepted',
				clock: () => new Date(startedAt.getTime() + OBSERVATION_DURATION_MS),
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/file size drifted/
		);
	}
});

test('verify requires exactly one candidate record and one tarball', async () => {
	const current = await createFixtureCandidate();
	await writeFile(path.join(current.paths.directory, 'candidate-old.json'), '{}\n');
	await assert.rejects(
		verifyCandidateRecord({
			acceptanceStatus: 'accepted',
			clock: () => new Date(startedAt.getTime() + OBSERVATION_DURATION_MS),
			gitState: cleanGitState,
			repositoryRoot: current.repositoryRoot
		}),
		/exactly one record and one tarball/
	);
});

test('verify rejects branch, commit, and worktree drift', async () => {
	const current = await createFixtureCandidate();
	for (const [gitState, expected] of [
		[{ ...cleanGitState, branch: 'master' }, /release\/0\.17\.0/],
		[{ ...cleanGitState, commit: 'b'.repeat(40) }, /does not match recorded commit/],
		[{ ...cleanGitState, clean: false }, /runtime or worktree drift/],
		[{ ...cleanGitState, tagsAtHead: ['v0.17.0'] }, /must not have/]
	]) {
		await assert.rejects(
			verifyCandidateRecord({
				clock: () => startedAt,
				gitState,
				repositoryRoot: current.repositoryRoot
			}),
			expected
		);
	}
});

test('verify rejects future candidate timestamps and requires builtAt to equal observationStart', async () => {
	{
		const current = await createFixtureCandidate();
		const record = JSON.parse(await readFile(current.paths.record, 'utf8'));
		record.builtAt = new Date(startedAt.getTime() + 1).toISOString();
		await writeFile(current.paths.record, `${JSON.stringify(record, null, 2)}\n`);
		await assert.rejects(
			verifyCandidateRecord({
				clock: () => startedAt,
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/must equal observationStart exactly/
		);
	}

	{
		const current = await createFixtureCandidate();
		const record = JSON.parse(await readFile(current.paths.record, 'utf8'));
		const future = new Date(startedAt.getTime() + 1);
		record.builtAt = future.toISOString();
		record.observationStart = future.toISOString();
		record.earliestObservationEnd = new Date(
			future.getTime() + OBSERVATION_DURATION_MS
		).toISOString();
		await writeFile(current.paths.record, `${JSON.stringify(record, null, 2)}\n`);
		await assert.rejects(
			verifyCandidateRecord({
				clock: () => startedAt,
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/cannot be in the future/
		);
	}
});

test('release-owner acceptance cannot pass before five complete observation days', async () => {
	const current = await createFixtureCandidate();
	const early = new Date(startedAt.getTime() + OBSERVATION_DURATION_MS - 1);
	await assert.rejects(
		verifyCandidateRecord({
			acceptanceStatus: 'accepted',
			clock: () => early,
			gitState: cleanGitState,
			repositoryRoot: current.repositoryRoot
		}),
		/marked accepted.*before five full observation days/
	);

	const status = await verifyCandidateRecord({
		acceptanceStatus: 'accepted',
		clock: () => early,
		enforceObservationWindow: false,
		gitState: cleanGitState,
		requireAcceptance: false,
		repositoryRoot: current.repositoryRoot
	});
	assert.equal(status.accepted, true);
	assert.equal(status.acceptanceEligible, false);
	assert.equal(status.remainingMs, 1);

	const accepted = await verifyCandidateRecord({
		acceptanceStatus: 'accepted',
		clock: () => new Date(startedAt.getTime() + OBSERVATION_DURATION_MS),
		gitState: cleanGitState,
		repositoryRoot: current.repositoryRoot
	});
	assert.equal(accepted.acceptanceEligible, true);
	assert.equal(accepted.remainingMs, 0);
});

test('final verify requires the exact accepted decision after the full window', async () => {
	const current = await createFixtureCandidate();
	const afterWindow = () => new Date(startedAt.getTime() + OBSERVATION_DURATION_MS);
	for (const acceptanceStatus of ['testing', 'rejected']) {
		await assert.rejects(
			verifyCandidateRecord({
				acceptanceStatus,
				clock: afterWindow,
				gitState: cleanGitState,
				repositoryRoot: current.repositoryRoot
			}),
			/must be exactly accepted/
		);
	}
	const status = await verifyCandidateRecord({
		acceptanceStatus: 'testing',
		clock: afterWindow,
		enforceObservationWindow: false,
		gitState: cleanGitState,
		requireAcceptance: false,
		repositoryRoot: current.repositoryRoot
	});
	assert.equal(status.accepted, false);
	assert.equal(status.acceptanceEligible, true);
});

test('acceptance parser ignores the template alternatives and reads only an exact decision', () => {
	assert.equal(
		readAcceptanceStatus('- Decyzja: `not-started | testing | accepted | rejected`'),
		'testing'
	);
	assert.equal(readAcceptanceStatus('- Decyzja: `accepted`'), 'accepted');
	assert.equal(readAcceptanceStatus('- Decyzja: rejected'), 'rejected');
});

test('candidate tooling is local-only and contains no publish, deploy, or network primitive', async () => {
	const sources = await Promise.all(
		['candidate-record.mjs', 'candidate.mjs'].map((file) =>
			readFile(path.join(import.meta.dirname, file), 'utf8')
		)
	);
	for (const source of sources) {
		assert.doesNotMatch(
			source,
			/\bnpm\s+(?:publish|deprecate)|\bfetch\s*\(|\bdeploy\b|node:https|node:http|\bcurl\b/
		);
	}
});
