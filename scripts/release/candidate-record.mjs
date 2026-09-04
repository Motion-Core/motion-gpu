import { constants as fsConstants, createReadStream } from 'node:fs';
import {
	access,
	copyFile,
	mkdir,
	readFile,
	readdir,
	stat,
	unlink,
	writeFile
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
	assertPackedArtifactContents,
	assertPackedArtifactMetadata,
	EXPECTED_PACKAGE_NAME,
	readNpmTarballFiles
} from './release-contract.mjs';

export const CANDIDATE_VERSION = '0.17.0';
export const CANDIDATE_BRANCH = `release/${CANDIDATE_VERSION}`;
export const CANDIDATE_FILENAME = `${EXPECTED_PACKAGE_NAME}-${CANDIDATE_VERSION}.tgz`;
export const CANDIDATE_RECORD_FILENAME = 'candidate.json';
export const OBSERVATION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

const canonicalCommitPattern = /^[a-f0-9]{40}$/;

function candidatePaths(repositoryRoot) {
	const directory = path.join(repositoryRoot, 'docs', 'release-artifacts', CANDIDATE_VERSION);
	return {
		artifact: path.join(directory, CANDIDATE_FILENAME),
		directory,
		record: path.join(directory, CANDIDATE_RECORD_FILENAME),
		report: path.join(repositoryRoot, 'docs', 'SPEKTRAL_0.17.0_TEST_REPORT.md')
	};
}

function assertGitState(gitState, expectedCommit) {
	if (!gitState || typeof gitState !== 'object') {
		throw new Error('Candidate tooling requires an explicit Git state.');
	}
	if (gitState.branch !== CANDIDATE_BRANCH) {
		throw new Error(
			`Candidate branch must be exactly ${CANDIDATE_BRANCH}; received ${JSON.stringify(gitState.branch)}.`
		);
	}
	if (!canonicalCommitPattern.test(gitState.commit ?? '')) {
		throw new Error('Candidate HEAD must be a canonical 40-character Git commit.');
	}
	if (expectedCommit && gitState.commit !== expectedCommit) {
		throw new Error(
			`Candidate HEAD ${gitState.commit} does not match recorded commit ${expectedCommit}.`
		);
	}
	if (!gitState.clean) {
		throw new Error('Candidate worktree must be clean; runtime or worktree drift was detected.');
	}
	if (!gitState.artifactDirectoryIgnored) {
		throw new Error('Candidate artifact directory must be ignored by Git.');
	}
	if ((gitState.tagsAtHead ?? []).includes(`v${CANDIDATE_VERSION}`)) {
		throw new Error('The local candidate commit must not have the final release tag.');
	}
}

function canonicalIso(value, field) {
	if (typeof value !== 'string') {
		throw new Error(`Candidate record ${field} must be an ISO timestamp.`);
	}
	const parsed = new Date(value);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
		throw new Error(`Candidate record ${field} must be a canonical ISO timestamp.`);
	}
	return parsed;
}

function assertExactKeys(value, expected, field) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Candidate record ${field} must be an object.`);
	}
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
		throw new Error(`Candidate record ${field} keys must be exactly ${JSON.stringify(wanted)}.`);
	}
}

export function assertCandidateRecord(record) {
	assertExactKeys(
		record,
		[
			'artifact',
			'builtAt',
			'earliestObservationEnd',
			'git',
			'npmPack',
			'observationStart',
			'package',
			'schemaVersion',
			'version'
		],
		'root'
	);
	if (record.schemaVersion !== 1) {
		throw new Error('Candidate record schemaVersion must be 1.');
	}
	if (record.package !== EXPECTED_PACKAGE_NAME || record.version !== CANDIDATE_VERSION) {
		throw new Error(
			`Candidate record must identify ${EXPECTED_PACKAGE_NAME}@${CANDIDATE_VERSION}.`
		);
	}

	assertExactKeys(
		record.artifact,
		['fileCount', 'filename', 'npmIntegrity', 'npmShasum', 'sha512', 'size', 'unpackedSize'],
		'artifact'
	);
	if (record.artifact.filename !== CANDIDATE_FILENAME) {
		throw new Error(`Candidate artifact filename must be exactly ${CANDIDATE_FILENAME}.`);
	}
	if (!/^[a-f0-9]{128}$/.test(record.artifact.sha512 ?? '')) {
		throw new Error('Candidate artifact SHA-512 must be a 128-character lowercase hex digest.');
	}
	if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(record.artifact.npmIntegrity ?? '')) {
		throw new Error('Candidate artifact npm integrity must be an exact SHA-512 SRI value.');
	}
	if (!/^[a-f0-9]{40}$/.test(record.artifact.npmShasum ?? '')) {
		throw new Error('Candidate artifact npm shasum must be a 40-character SHA-1 digest.');
	}
	for (const field of ['fileCount', 'size', 'unpackedSize']) {
		if (!Number.isSafeInteger(record.artifact[field]) || record.artifact[field] <= 0) {
			throw new Error(`Candidate artifact ${field} must be a positive safe integer.`);
		}
	}

	assertExactKeys(record.git, ['branch', 'commit', 'tag'], 'git');
	if (
		record.git.branch !== CANDIDATE_BRANCH ||
		!canonicalCommitPattern.test(record.git.commit ?? '') ||
		record.git.tag !== null
	) {
		throw new Error('Candidate record must identify the exact untagged release branch commit.');
	}

	const builtAt = canonicalIso(record.builtAt, 'builtAt');
	const observationStart = canonicalIso(record.observationStart, 'observationStart');
	const earliestObservationEnd = canonicalIso(
		record.earliestObservationEnd,
		'earliestObservationEnd'
	);
	if (builtAt.getTime() !== observationStart.getTime()) {
		throw new Error('Candidate builtAt must equal observationStart exactly.');
	}
	if (earliestObservationEnd.getTime() !== observationStart.getTime() + OBSERVATION_DURATION_MS) {
		throw new Error('Candidate earliestObservationEnd must be exactly five full days after start.');
	}
	if (!record.npmPack || typeof record.npmPack !== 'object' || Array.isArray(record.npmPack)) {
		throw new Error('Candidate record must embed one npm pack metadata object.');
	}

	return record;
}

async function fileDigests(file) {
	const sha1 = createHash('sha1');
	const sha512 = createHash('sha512');
	for await (const chunk of createReadStream(file)) {
		sha1.update(chunk);
		sha512.update(chunk);
	}
	const sha512Buffer = sha512.digest();
	return {
		integrity: `sha512-${sha512Buffer.toString('base64')}`,
		sha512: sha512Buffer.toString('hex'),
		shasum: sha1.digest('hex')
	};
}

async function validateArtifact({ manifest, metadata, tarball }) {
	const npmPack = assertPackedArtifactMetadata({
		manifest,
		metadata,
		version: CANDIDATE_VERSION
	});
	if (path.basename(tarball) !== CANDIDATE_FILENAME) {
		throw new Error(`Candidate source tarball must be named exactly ${CANDIDATE_FILENAME}.`);
	}
	const tarballStat = await stat(tarball);
	if (!tarballStat.isFile() || tarballStat.size !== npmPack.size) {
		throw new Error('Candidate tarball size does not match npm pack metadata.');
	}

	const digests = await fileDigests(tarball);
	if (npmPack.integrity !== digests.integrity) {
		throw new Error('Candidate npm integrity does not match the tarball bytes.');
	}
	if (npmPack.shasum !== digests.shasum) {
		throw new Error('Candidate npm shasum does not match the tarball bytes.');
	}
	const archiveFiles = await readNpmTarballFiles(tarball);
	assertPackedArtifactContents({ archiveFiles, metadataFiles: npmPack.files });
	let unpackedSize = 0;
	for (const file of npmPack.files) {
		const archiveFile = archiveFiles.get(file.path);
		if (archiveFile?.length !== file.size) {
			throw new Error(`Candidate npm pack file size drifted for ${file.path}.`);
		}
		unpackedSize += file.size;
	}
	if (unpackedSize !== npmPack.unpackedSize) {
		throw new Error('Candidate npm pack unpacked size does not equal its file metadata.');
	}

	return { digests, npmPack };
}

async function pathExists(file) {
	try {
		await access(file);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

async function assertCandidateSlotEmpty(paths) {
	if ((await pathExists(paths.record)) || (await pathExists(paths.artifact))) {
		throw new Error('Candidate record or artifact already exists; refusing to overwrite it.');
	}
	if (!(await pathExists(paths.directory))) return;
	const candidateFiles = (await readdir(paths.directory)).filter(
		(file) => file.endsWith('.tgz') || /^candidate(?:\.|-)/.test(file)
	);
	if (candidateFiles.length > 0) {
		throw new Error(
			`Candidate directory already contains candidate material: ${candidateFiles.join(', ')}.`
		);
	}
}

function getNow(clock) {
	const now = clock();
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
		throw new Error('Candidate clock must return a valid Date.');
	}
	return now;
}

export async function createCandidateRecord({
	clock = () => new Date(),
	gitState,
	metadataPath,
	repositoryRoot,
	tarballPath
}) {
	const paths = candidatePaths(repositoryRoot);
	assertGitState(gitState);
	await assertCandidateSlotEmpty(paths);

	const manifest = JSON.parse(
		await readFile(path.join(repositoryRoot, 'packages/spektral/package.json'), 'utf8')
	);
	const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
	const { digests, npmPack } = await validateArtifact({
		manifest,
		metadata,
		tarball: tarballPath
	});
	const now = getNow(clock);
	const timestamp = now.toISOString();
	const record = assertCandidateRecord({
		artifact: {
			fileCount: npmPack.entryCount,
			filename: CANDIDATE_FILENAME,
			npmIntegrity: npmPack.integrity,
			npmShasum: npmPack.shasum,
			sha512: digests.sha512,
			size: npmPack.size,
			unpackedSize: npmPack.unpackedSize
		},
		builtAt: timestamp,
		earliestObservationEnd: new Date(now.getTime() + OBSERVATION_DURATION_MS).toISOString(),
		git: { branch: gitState.branch, commit: gitState.commit, tag: null },
		npmPack,
		observationStart: timestamp,
		package: EXPECTED_PACKAGE_NAME,
		schemaVersion: 1,
		version: CANDIDATE_VERSION
	});

	await mkdir(paths.directory, { recursive: true });
	let copiedArtifact = false;
	try {
		await copyFile(tarballPath, paths.artifact, fsConstants.COPYFILE_EXCL);
		copiedArtifact = true;
		await writeFile(paths.record, `${JSON.stringify(record, null, '\t')}\n`, {
			encoding: 'utf8',
			flag: 'wx'
		});
	} catch (error) {
		if (copiedArtifact) await unlink(paths.artifact).catch(() => {});
		throw error;
	}

	return { paths, record };
}

export function readAcceptanceStatus(reportText) {
	const match = reportText.match(/^- Decyzja:\s*`?(not-started|testing|accepted|rejected)`?\s*$/m);
	return match?.[1] ?? 'testing';
}

export async function verifyCandidateRecord({
	acceptanceStatus = 'testing',
	clock = () => new Date(),
	enforceObservationWindow = true,
	gitState,
	requireAcceptance = true,
	repositoryRoot
}) {
	const paths = candidatePaths(repositoryRoot);
	const record = assertCandidateRecord(JSON.parse(await readFile(paths.record, 'utf8')));
	assertGitState(gitState, record.git.commit);

	const directoryFiles = await readdir(paths.directory);
	const candidateMaterial = directoryFiles
		.filter((file) => file.endsWith('.tgz') || /^candidate(?:\.|-)/.test(file))
		.sort();
	const expectedCandidateMaterial = [CANDIDATE_FILENAME, CANDIDATE_RECORD_FILENAME].sort();
	if (!isDeepStrictEqual(candidateMaterial, expectedCandidateMaterial)) {
		throw new Error('Candidate directory must contain exactly one record and one tarball.');
	}
	const tarballs = directoryFiles.filter((file) => file.endsWith('.tgz'));
	if (tarballs.length !== 1 || tarballs[0] !== record.artifact.filename) {
		throw new Error(
			`Candidate directory must contain exactly ${record.artifact.filename}; found ${tarballs.length}.`
		);
	}
	const manifest = JSON.parse(
		await readFile(path.join(repositoryRoot, 'packages/spektral/package.json'), 'utf8')
	);
	const { digests, npmPack } = await validateArtifact({
		manifest,
		metadata: [record.npmPack],
		tarball: paths.artifact
	});
	const duplicateMetadata = {
		fileCount: npmPack.entryCount,
		filename: npmPack.filename,
		npmIntegrity: npmPack.integrity,
		npmShasum: npmPack.shasum,
		sha512: digests.sha512,
		size: npmPack.size,
		unpackedSize: npmPack.unpackedSize
	};
	if (!isDeepStrictEqual(duplicateMetadata, record.artifact)) {
		throw new Error('Candidate artifact bytes or npm pack metadata drifted from the record.');
	}

	const now = getNow(clock);
	const observationStart = new Date(record.observationStart);
	if (now.getTime() < observationStart.getTime()) {
		throw new Error('Candidate observation timestamps cannot be in the future.');
	}
	const earliestObservationEnd = new Date(record.earliestObservationEnd);
	const remainingMs = Math.max(0, earliestObservationEnd.getTime() - now.getTime());
	const accepted = acceptanceStatus === 'accepted';
	if (requireAcceptance && !accepted) {
		throw new Error(
			`Candidate report decision must be exactly accepted; received ${JSON.stringify(acceptanceStatus)}.`
		);
	}
	if (accepted && remainingMs > 0 && enforceObservationWindow) {
		throw new Error(
			`Candidate was marked accepted ${remainingMs} ms before five full observation days elapsed.`
		);
	}

	return {
		accepted,
		acceptanceEligible: remainingMs === 0,
		remainingMs,
		paths,
		record
	};
}

export { candidatePaths };
