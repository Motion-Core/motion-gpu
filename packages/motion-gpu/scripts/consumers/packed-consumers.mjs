import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const repositoryRoot = path.resolve(packageRoot, '../..');
const fixtureRoot = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureNames = ['core', 'react', 'svelte', 'vue'];
const expectedPublicEntries = [
	'.',
	'./advanced',
	'./core',
	'./core/advanced',
	'./react',
	'./react/advanced',
	'./svelte',
	'./svelte/advanced',
	'./vue',
	'./vue/advanced'
];

function normalizePath(file) {
	return file.split(path.sep).join('/');
}

export function injectTarballPath(manifestSource, tarballPath) {
	const placeholder = '__MOTION_GPU_TARBALL__';
	const occurrences = manifestSource.split(placeholder).length - 1;
	if (occurrences !== 1) {
		throw new Error(`Expected exactly one ${placeholder} placeholder; found ${occurrences}.`);
	}

	return manifestSource.replace(placeholder, normalizePath(tarballPath));
}

export function assertPublicExportMap(exportsMap) {
	assert.ok(exportsMap && typeof exportsMap === 'object', 'Packed manifest must define exports.');
	assert.deepEqual(
		Object.keys(exportsMap).sort(),
		[...expectedPublicEntries].sort(),
		'Packed manifest public entrypoints changed.'
	);
}

async function runCommand(command, arguments_, { cwd, capture = false, allowFailure = false }) {
	console.log(`[packed-consumers] ${command} ${arguments_.join(' ')}`);
	const child = spawn(command, arguments_, {
		cwd,
		env: process.env,
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
	});
	let stdout = '';
	let stderr = '';

	if (capture) {
		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr?.on('data', (chunk) => {
			stderr += chunk;
		});
	}

	const exitCode = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('close', resolve);
	});
	if (exitCode !== 0 && !allowFailure) {
		throw new Error(`${command} ${arguments_.join(' ')} failed with exit code ${exitCode}.`);
	}

	return { exitCode, stderr, stdout };
}

async function findPackedTarball(directory) {
	const tarballs = (await readdir(directory)).filter((file) => file.endsWith('.tgz'));
	assert.equal(tarballs.length, 1, `Expected one packed tarball; found ${tarballs.length}.`);
	return path.join(directory, tarballs[0]);
}

async function installFixtures(temporaryRoot, tarballPath) {
	const consumerRoot = path.join(temporaryRoot, 'consumers');
	await mkdir(consumerRoot, { recursive: true });

	for (const fixtureName of fixtureNames) {
		const fixtureDirectory = path.join(consumerRoot, fixtureName);
		await cp(path.join(fixtureRoot, fixtureName), fixtureDirectory, { recursive: true });
		const manifestPath = path.join(fixtureDirectory, 'package.json');
		const manifest = injectTarballPath(await readFile(manifestPath, 'utf8'), tarballPath);
		await writeFile(manifestPath, manifest);
	}

	const repositoryManifest = JSON.parse(
		await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')
	);
	assert.equal(
		typeof repositoryManifest.packageManager,
		'string',
		'Repository manifest must pin packageManager.'
	);
	await writeFile(
		path.join(temporaryRoot, 'package.json'),
		`${JSON.stringify(
			{
				name: 'motion-gpu-packed-consumers',
				private: true,
				packageManager: repositoryManifest.packageManager
			},
			null,
			2
		)}\n`
	);
	await writeFile(
		path.join(temporaryRoot, 'pnpm-workspace.yaml'),
		"packages:\n  - 'consumers/*'\n"
	);
	await runCommand(
		'pnpm',
		['install', '--ignore-scripts', '--strict-peer-dependencies', '--frozen-lockfile=false'],
		{ cwd: temporaryRoot }
	);

	return consumerRoot;
}

async function assertPackedArtifacts(coreConsumerDirectory) {
	const installedPackage = path.join(coreConsumerDirectory, 'node_modules/@motion-core/motion-gpu');
	const manifest = JSON.parse(await readFile(path.join(installedPackage, 'package.json'), 'utf8'));
	assertPublicExportMap(manifest.exports);

	for (const entry of Object.values(manifest.exports)) {
		assert.ok(entry && typeof entry === 'object', 'Every public export must be conditional.');
		for (const target of Object.values(entry)) {
			assert.equal(typeof target, 'string', 'Every export target must be a file path.');
			await access(path.join(installedPackage, target));
		}
	}

	await access(path.join(installedPackage, 'dist/motion-gpu.css'));
	await access(path.join(installedPackage, 'dist/svelte/FragCanvas.svelte'));
	const svelteEntry = await readFile(path.join(installedPackage, 'dist/svelte/index.js'), 'utf8');
	assert.match(svelteEntry, /["']\.\/FragCanvas\.svelte["']/);
	const vueEntry = await readFile(path.join(installedPackage, 'dist/vue/index.js'), 'utf8');
	assert.match(vueEntry, /["']\.\.\/motion-gpu\.css["']/);
}

async function assertInternalImportsAreBlocked(coreConsumerDirectory) {
	for (const specifier of [
		'@motion-core/motion-gpu/src/lib/core/index.js',
		'@motion-core/motion-gpu/dist/index.js'
	]) {
		const result = await runCommand(
			'node',
			['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`],
			{ cwd: coreConsumerDirectory, capture: true, allowFailure: true }
		);
		assert.notEqual(
			result.exitCode,
			0,
			`${specifier} unexpectedly resolved from the packed package.`
		);
		assert.match(result.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
	}
}

async function findFilesWithExtension(directory, extension) {
	const matches = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			matches.push(...(await findFilesWithExtension(entryPath, extension)));
		} else if (entry.name.endsWith(extension)) {
			matches.push(entryPath);
		}
	}
	return matches;
}

async function checkAndBuildFixtures(consumerRoot) {
	for (const fixtureName of fixtureNames) {
		const fixtureDirectory = path.join(consumerRoot, fixtureName);
		await runCommand('pnpm', ['run', 'check'], { cwd: fixtureDirectory });
		await runCommand('pnpm', ['run', 'build'], { cwd: fixtureDirectory });
		await access(path.join(fixtureDirectory, 'dist/index.html'));
	}

	for (const fixtureName of ['svelte', 'vue']) {
		const stylesheets = await findFilesWithExtension(
			path.join(consumerRoot, fixtureName, 'dist'),
			'.css'
		);
		assert.ok(stylesheets.length > 0, `${fixtureName} consumer emitted no CSS artifact.`);
	}
}

export async function runPackedConsumerChecks() {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'motion-gpu-packed-consumers-'));
	const artifactDirectory = path.join(temporaryRoot, 'artifacts');
	await mkdir(artifactDirectory, { recursive: true });

	try {
		await runCommand('pnpm', ['pack', '--pack-destination', artifactDirectory], {
			cwd: packageRoot
		});
		const tarballPath = await findPackedTarball(artifactDirectory);
		const consumerRoot = await installFixtures(temporaryRoot, tarballPath);
		const coreConsumerDirectory = path.join(consumerRoot, 'core');
		await assertPackedArtifacts(coreConsumerDirectory);
		await assertInternalImportsAreBlocked(coreConsumerDirectory);
		await checkAndBuildFixtures(consumerRoot);
		console.log(
			'Packed core, React, Svelte and Vue consumer checks passed for all 10 entrypoints.'
		);
	} finally {
		if (process.env.MOTION_GPU_KEEP_CONSUMERS === '1') {
			console.log(`Packed consumer workspace retained at ${temporaryRoot}.`);
		} else {
			await rm(temporaryRoot, { recursive: true, force: true });
		}
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runPackedConsumerChecks();
}
