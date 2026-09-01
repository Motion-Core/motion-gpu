import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
	CANDIDATE_BRANCH,
	CANDIDATE_VERSION,
	candidatePaths,
	createCandidateRecord,
	readAcceptanceStatus,
	verifyCandidateRecord
} from './candidate-record.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '../..');

async function gitOutput(args) {
	return (await execFileAsync('git', args, { cwd: repositoryRoot })).stdout.trim();
}

async function isArtifactDirectoryIgnored() {
	try {
		await execFileAsync(
			'git',
			['check-ignore', '--quiet', '--', `docs/release-artifacts/${CANDIDATE_VERSION}`],
			{ cwd: repositoryRoot }
		);
		return true;
	} catch (error) {
		if (error?.code === 1) return false;
		throw error;
	}
}

async function readGitState() {
	const [branch, commit, status, tagOutput, artifactDirectoryIgnored] = await Promise.all([
		gitOutput(['branch', '--show-current']),
		gitOutput(['rev-parse', 'HEAD']),
		gitOutput(['status', '--porcelain=v1', '--untracked-files=all']),
		gitOutput(['tag', '--points-at', 'HEAD']),
		isArtifactDirectoryIgnored()
	]);
	return {
		artifactDirectoryIgnored,
		branch,
		clean: status === '',
		commit,
		tagsAtHead: tagOutput === '' ? [] : tagOutput.split('\n')
	};
}

async function acceptanceStatus() {
	const { report } = candidatePaths(repositoryRoot);
	return readAcceptanceStatus(await readFile(report, 'utf8'));
}

function printVerification(result) {
	process.stdout.write(
		[
			`candidate=${result.record.package}@${result.record.version}`,
			`artifact=${result.paths.artifact}`,
			`sha512=${result.record.artifact.sha512}`,
			`commit=${result.record.git.commit}`,
			`acceptance=${result.accepted ? 'accepted-by-release-owner' : 'not-accepted'}`,
			`acceptanceEligible=${result.acceptanceEligible}`,
			`remainingMs=${result.remainingMs}`
		].join('\n') + '\n'
	);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'create') {
	if (args.length !== 2) {
		throw new Error('Usage: node candidate.mjs create <spektral-0.17.0.tgz> <npm-pack-json>.');
	}
	const [tarball, metadata] = args.map((file) => path.resolve(file));
	const result = await createCandidateRecord({
		gitState: await readGitState(),
		metadataPath: metadata,
		repositoryRoot,
		tarballPath: tarball
	});
	process.stdout.write(
		`candidate=${result.paths.record}\nartifact=${result.paths.artifact}\nbranch=${CANDIDATE_BRANCH}\n`
	);
} else if (command === 'verify' || command === 'status') {
	if (args.length !== 0) {
		throw new Error(`Usage: node candidate.mjs ${command}.`);
	}
	const result = await verifyCandidateRecord({
		acceptanceStatus: await acceptanceStatus(),
		enforceObservationWindow: command === 'verify',
		gitState: await readGitState(),
		requireAcceptance: command === 'verify',
		repositoryRoot
	});
	printVerification(result);
} else {
	throw new Error('Usage: node candidate.mjs <create|verify|status>.');
}
