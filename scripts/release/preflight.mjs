import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertReleaseEvent, assertReleaseIdentity } from './release-contract.mjs';

const [eventPath, githubRepository] = process.argv.slice(2);
if (!eventPath || !githubRepository) {
	throw new Error('Usage: node preflight.mjs <github-event-path> <owner/repository>.');
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const event = JSON.parse(await readFile(eventPath, 'utf8'));
const manifest = JSON.parse(
	await readFile(path.join(repositoryRoot, 'packages/spektral/package.json'), 'utf8')
);
const version = assertReleaseEvent(event);
assertReleaseIdentity({ githubRepository, manifest, version });
process.stdout.write(`version=${version}\n`);
