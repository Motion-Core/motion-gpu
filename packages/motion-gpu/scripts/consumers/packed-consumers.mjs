import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { publicApiManifest } from './public-api-manifest.mjs';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const repositoryRoot = path.resolve(packageRoot, '../..');
const fixtureRoot = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureNames = ['core', 'react', 'svelte', 'vue'];
const expectedPublicEntries = Object.keys(publicApiManifest);
const fixturePublicEntries = {
	core: ['.', './advanced', './core', './core/advanced'],
	react: ['./react', './react/advanced'],
	svelte: ['./svelte', './svelte/advanced'],
	vue: ['./vue', './vue/advanced']
};
const entryAliases = {
	'.': 'Root',
	'./advanced': 'RootAdvanced',
	'./core': 'Core',
	'./core/advanced': 'CoreAdvanced',
	'./react': 'React',
	'./react/advanced': 'ReactAdvanced',
	'./svelte': 'Svelte',
	'./svelte/advanced': 'SvelteAdvanced',
	'./vue': 'Vue',
	'./vue/advanced': 'VueAdvanced'
};
export const nodeSsrEntrypoints = Object.freeze([
	'@motion-core/motion-gpu',
	'@motion-core/motion-gpu/advanced',
	'@motion-core/motion-gpu/core',
	'@motion-core/motion-gpu/core/advanced'
]);
const currentVersions = {
	core: { typescript: '5.9.3', vite: '8.2.1' },
	react: {
		'@types/react': '19.2.18',
		'@types/react-dom': '19.2.4',
		react: '19.2.8',
		'react-dom': '19.2.8',
		typescript: '5.9.3',
		vite: '8.2.1'
	},
	svelte: {
		'@sveltejs/vite-plugin-svelte': '7.3.0',
		'svelte-check': '4.7.6',
		svelte: '5.56.9',
		typescript: '5.9.3',
		vite: '8.2.1'
	},
	vue: {
		'@vitejs/plugin-vue': '6.0.8',
		typescript: '5.9.3',
		vite: '8.2.1',
		vue: '3.5.41',
		'vue-tsc': '3.3.9'
	}
};
const minimumVersions = {
	...currentVersions,
	react: {
		...currentVersions.react,
		'@types/react': '19.0.0',
		'@types/react-dom': '19.0.0',
		react: '19.0.0',
		'react-dom': '19.0.0'
	},
	svelte: {
		...currentVersions.svelte,
		'@sveltejs/vite-plugin-svelte': '4.0.0',
		svelte: '5.29.0',
		vite: '5.4.21'
	},
	vue: { ...currentVersions.vue, vue: '3.5.2' }
};

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

export function parsePackageSpec(packageSpec) {
	if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(packageSpec)) {
		return { dependencySpec: packageSpec, expectedVersion: packageSpec, type: 'version' };
	}

	if (path.isAbsolute(packageSpec) && packageSpec.endsWith('.tgz')) {
		return {
			dependencySpec: `file:${normalizePath(packageSpec)}`,
			expectedVersion: undefined,
			type: 'tarball'
		};
	}

	throw new Error(
		`Package spec must be an absolute .tgz path or an exact stable version; received ${JSON.stringify(packageSpec)}.`
	);
}

export function injectPackageSpec(manifestSource, dependencySpec) {
	const placeholder = 'file:__MOTION_GPU_TARBALL__';
	const occurrences = manifestSource.split(placeholder).length - 1;
	if (occurrences !== 1) {
		throw new Error(`Expected exactly one ${placeholder} placeholder; found ${occurrences}.`);
	}

	return manifestSource.replace(placeholder, dependencySpec);
}

export function parsePackedConsumerArguments(arguments_) {
	let includeMinimumPeers = false;
	let packageSpec;

	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === '--peer-matrix') {
			if (includeMinimumPeers) {
				throw new Error('Packed consumer option --peer-matrix may only be provided once.');
			}
			includeMinimumPeers = true;
			continue;
		}

		if (argument === '--package-spec') {
			if (packageSpec !== undefined) {
				throw new Error('Packed consumer option --package-spec may only be provided once.');
			}
			packageSpec = arguments_[index + 1];
			if (!packageSpec || packageSpec.startsWith('--')) {
				throw new Error('Packed consumer option --package-spec requires a value.');
			}
			index += 1;
			continue;
		}

		throw new Error(`Unknown packed consumer option: ${argument}`);
	}

	return { includeMinimumPeers, packageSpec };
}

export function assertPublicExportMap(exportsMap) {
	assert.ok(exportsMap && typeof exportsMap === 'object', 'Packed manifest must define exports.');
	assert.deepEqual(
		Object.keys(exportsMap).sort(),
		[...expectedPublicEntries].sort(),
		'Packed manifest public entrypoints changed.'
	);
}

/**
 * Verifies the exact runtime/type-only symbol surface collected from package declarations.
 */
export function assertPublicApiSymbols(actual) {
	assert.deepEqual(
		Object.keys(actual).sort(),
		Object.keys(publicApiManifest).sort(),
		'Collected public API entrypoints changed.'
	);

	for (const [entryName, expected] of Object.entries(publicApiManifest)) {
		const actualEntry = actual[entryName];
		assert.ok(actualEntry, `Missing collected API entry ${entryName}.`);
		assert.deepEqual(
			actualEntry.runtime,
			expected.runtime,
			`${entryName} runtime exports changed.`
		);
		assert.deepEqual(
			actualEntry.typeOnly,
			expected.typeOnly,
			`${entryName} type-only exports changed.`
		);
	}
}

/**
 * Generates a compile-only source file importing every declared public symbol for a fixture.
 */
export function createPublicApiCompileContract(fixtureName) {
	const entries = fixturePublicEntries[fixtureName];
	if (!entries) {
		throw new Error(`Unknown public API fixture: ${fixtureName}`);
	}

	const lines = [
		'// Generated from scripts/consumers/public-api-manifest.mjs.',
		'// Every import is intentional: missing symbols must fail consumer compilation.',
		''
	];
	const runtimeAliases = [];

	for (const entryName of entries) {
		const expected = publicApiManifest[entryName];
		const aliasPrefix = entryAliases[entryName];
		const specifier =
			entryName === '.'
				? '@motion-core/motion-gpu'
				: `@motion-core/motion-gpu/${entryName.slice(2)}`;
		const runtimeImports = expected.runtime.map(
			(symbol) => `${symbol} as ${aliasPrefix}_${symbol}`
		);
		const typeImports = expected.typeOnly.map((symbol) => `${symbol} as ${aliasPrefix}_${symbol}`);

		lines.push(`import { ${runtimeImports.join(', ')} } from ${JSON.stringify(specifier)};`);
		lines.push(`import type { ${typeImports.join(', ')} } from ${JSON.stringify(specifier)};`);
		lines.push('');
		runtimeAliases.push(...expected.runtime.map((symbol) => `${aliasPrefix}_${symbol}`));
	}

	lines.push(`void [${runtimeAliases.join(', ')}];`, '');
	return lines.join('\n');
}

/** Generates the direct Node import contract used against the installed package. */
export function createNodeSsrImportContract() {
	return [
		"if (!Reflect.deleteProperty(globalThis, 'navigator')) throw new Error('Could not remove navigator for the SSR import contract.');",
		"if ('navigator' in globalThis) throw new Error('SSR import contract must run without navigator.gpu.');",
		`const entrypoints = ${JSON.stringify(nodeSsrEntrypoints)};`,
		'for (const entrypoint of entrypoints) await import(entrypoint);'
	].join(' ');
}

export function applyExactVersions(manifest, versions) {
	const result = structuredClone(manifest);
	for (const [dependency, version] of Object.entries(versions)) {
		let found = false;
		for (const group of ['dependencies', 'devDependencies']) {
			if (result[group]?.[dependency]) {
				result[group][dependency] = version;
				found = true;
			}
		}
		if (!found) {
			throw new Error(`Cannot pin undeclared fixture dependency ${dependency}.`);
		}
	}
	return result;
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

async function installFixtures(temporaryRoot, dependencySpec, profile) {
	const consumerRoot = path.join(temporaryRoot, 'consumers');
	await mkdir(consumerRoot, { recursive: true });

	for (const fixtureName of fixtureNames) {
		const fixtureDirectory = path.join(consumerRoot, fixtureName);
		await cp(path.join(fixtureRoot, fixtureName), fixtureDirectory, { recursive: true });
		const manifestPath = path.join(fixtureDirectory, 'package.json');
		const source = injectPackageSpec(await readFile(manifestPath, 'utf8'), dependencySpec);
		const manifest = applyExactVersions(JSON.parse(source), profile.versions[fixtureName]);
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
		await writeFile(
			path.join(fixtureDirectory, 'src/public-api-contract.ts'),
			createPublicApiCompileContract(fixtureName)
		);
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

async function readInstalledVersion(consumerDirectory, dependency) {
	const manifestPath = path.join(consumerDirectory, 'node_modules', dependency, 'package.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	assert.equal(typeof manifest.version, 'string', `${dependency} has no installed version.`);
	return manifest.version;
}

async function assertExactVersions(consumerRoot, profile) {
	for (const [fixtureName, versions] of Object.entries(profile.versions)) {
		for (const [dependency, expectedVersion] of Object.entries(versions)) {
			const installedVersion = await readInstalledVersion(
				path.join(consumerRoot, fixtureName),
				dependency
			);
			assert.equal(
				installedVersion,
				expectedVersion,
				`${profile.name} ${fixtureName} resolved ${dependency}@${installedVersion}; expected ${expectedVersion}.`
			);
		}
	}
}

async function assertMotionGpuVersion(consumerRoot, expectedVersion) {
	if (expectedVersion === undefined) return;

	for (const fixtureName of fixtureNames) {
		const installedVersion = await readInstalledVersion(
			path.join(consumerRoot, fixtureName),
			'@motion-core/motion-gpu'
		);
		assert.equal(
			installedVersion,
			expectedVersion,
			`${fixtureName} resolved @motion-core/motion-gpu@${installedVersion}; expected ${expectedVersion}.`
		);
	}
}

async function assertPackedArtifacts(coreConsumerDirectory) {
	const installedPackage = path.join(coreConsumerDirectory, 'node_modules/@motion-core/motion-gpu');
	const manifest = JSON.parse(await readFile(path.join(installedPackage, 'package.json'), 'utf8'));
	assertPublicExportMap(manifest.exports);
	assertPublicApiSymbols(collectDeclarationPublicApi(installedPackage, manifest.exports));

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

function collectDeclarationPublicApi(installedPackage, exportsMap) {
	const entryFiles = Object.fromEntries(
		Object.entries(exportsMap).map(([entryName, exportConfig]) => {
			assert.equal(
				typeof exportConfig.types,
				'string',
				`${entryName} must define a declaration target.`
			);
			return [entryName, path.resolve(installedPackage, exportConfig.types)];
		})
	);
	const program = ts.createProgram(Object.values(entryFiles), {
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		skipLibCheck: true,
		target: ts.ScriptTarget.ES2022
	});
	const checker = program.getTypeChecker();
	const actual = {};

	for (const [entryName, entryFile] of Object.entries(entryFiles)) {
		const sourceFile = program.getSourceFile(entryFile);
		assert.ok(sourceFile, `TypeScript did not load ${entryName} declarations at ${entryFile}.`);
		const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
		assert.ok(moduleSymbol, `TypeScript did not resolve the ${entryName} module symbol.`);
		const runtime = [];
		const typeOnly = [];

		for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
			let targetSymbol = exportedSymbol;
			if (exportedSymbol.flags & ts.SymbolFlags.Alias) {
				targetSymbol = checker.getAliasedSymbol(exportedSymbol);
			}

			const isRuntime = Boolean(targetSymbol.flags & ts.SymbolFlags.Value);
			const isType = Boolean(targetSymbol.flags & ts.SymbolFlags.Type);
			assert.ok(
				isRuntime || isType,
				`${entryName} export ${exportedSymbol.name} has no public value or type identity.`
			);
			if (isRuntime) {
				runtime.push(exportedSymbol.name);
			} else {
				typeOnly.push(exportedSymbol.name);
			}
		}

		actual[entryName] = {
			runtime: runtime.sort(),
			typeOnly: typeOnly.sort()
		};
	}

	return actual;
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

async function assertNodeSsrImports(coreConsumerDirectory) {
	await runCommand('node', ['--input-type=module', '--eval', createNodeSsrImportContract()], {
		cwd: coreConsumerDirectory
	});
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
		if (fixtureName === 'core') {
			await runCommand('pnpm', ['run', 'test:custom-pass'], { cwd: fixtureDirectory });
		}
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

async function prepareTarball(temporaryRoot) {
	const artifactDirectory = path.join(temporaryRoot, 'artifacts');
	await mkdir(artifactDirectory, { recursive: true });
	await runCommand('pnpm', ['pack', '--pack-destination', artifactDirectory], {
		cwd: packageRoot
	});
	return findPackedTarball(artifactDirectory);
}

async function checkProfile(temporaryRoot, packageSpec, profile) {
	const profileRoot = path.join(temporaryRoot, profile.name);
	await mkdir(profileRoot, { recursive: true });
	console.log(`[packed-consumers] checking ${profile.name} dependency profile`);
	const consumerRoot = await installFixtures(profileRoot, packageSpec.dependencySpec, profile);
	await assertExactVersions(consumerRoot, profile);
	await assertMotionGpuVersion(consumerRoot, packageSpec.expectedVersion);
	const coreConsumerDirectory = path.join(consumerRoot, 'core');
	await assertPackedArtifacts(coreConsumerDirectory);
	await assertNodeSsrImports(coreConsumerDirectory);
	await assertInternalImportsAreBlocked(coreConsumerDirectory);
	await checkAndBuildFixtures(consumerRoot);
}

export async function runPackedConsumerChecks({ includeMinimumPeers = false, packageSpec } = {}) {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'motion-gpu-packed-consumers-'));

	try {
		let resolvedPackageSpec;
		if (packageSpec === undefined) {
			resolvedPackageSpec = parsePackageSpec(await prepareTarball(temporaryRoot));
		} else {
			resolvedPackageSpec = parsePackageSpec(packageSpec);
			if (resolvedPackageSpec.type === 'tarball') {
				await access(packageSpec);
			}
		}
		const profiles = [{ name: 'current', versions: currentVersions }];
		if (includeMinimumPeers) {
			profiles.push({ name: 'minimum', versions: minimumVersions });
		}
		for (const profile of profiles) {
			await checkProfile(temporaryRoot, resolvedPackageSpec, profile);
		}
		console.log(
			`Packed consumer checks passed for all 10 entrypoints (${profiles.map(({ name }) => name).join(' + ')} profiles).`
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
	await runPackedConsumerChecks(parsePackedConsumerArguments(process.argv.slice(2)));
}
