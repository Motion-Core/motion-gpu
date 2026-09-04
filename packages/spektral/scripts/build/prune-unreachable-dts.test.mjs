import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
	findUnreachableDeclarations,
	pruneUnreachableDeclarations,
	publicDeclarationPaths
} from './prune-unreachable-dts.mjs';

async function createDeclarationFixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'spektral-prune-dts-'));
	for (const publicPath of publicDeclarationPaths) {
		const file = path.join(root, publicPath);
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, publicPath === 'index.d.ts' ? "export * from './shared.js';\n" : '');
	}
	await writeFile(
		path.join(root, 'shared.d.ts'),
		"export type { Kept } from './nested/kept.js';\n"
	);
	await mkdir(path.join(root, 'nested'), { recursive: true });
	await writeFile(path.join(root, 'nested/kept.d.ts'), 'export interface Kept {}\n');
	await writeFile(
		path.join(root, 'nested/unused.d.ts'),
		'/** Internal JSDoc. */\nexport interface Unused {}\n'
	);
	await mkdir(path.join(root, 'svelte'), { recursive: true });
	await writeFile(
		path.join(root, 'svelte/Widget.svelte'),
		'<script lang="ts">import type { Raw } from \'../raw-only\';</script>'
	);
	await writeFile(
		path.join(root, 'svelte/Widget.svelte.d.ts'),
		"import '../styles.css';\nexport default class Widget {}\n"
	);
	await writeFile(path.join(root, 'raw-only.d.ts'), 'export interface Raw {}\n');
	return root;
}

test('retains the public, component, and raw Svelte declaration graph only', async () => {
	const root = await createDeclarationFixture();
	try {
		const result = await findUnreachableDeclarations(root);
		assert.deepEqual(
			result.unreachable.map((file) => path.relative(root, file)),
			['nested/unused.d.ts']
		);
		const pruned = await pruneUnreachableDeclarations(root);
		assert.equal(pruned.removedBytes, 50);
		await assert.rejects(readFile(path.join(root, 'nested/unused.d.ts')), /ENOENT/);
		assert.match(await readFile(path.join(root, 'nested/kept.d.ts'), 'utf8'), /Kept/);
		assert.match(await readFile(path.join(root, 'raw-only.d.ts'), 'utf8'), /Raw/);
		assert.match(await readFile(path.join(root, 'svelte/Widget.svelte.d.ts'), 'utf8'), /Widget/);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});

test('fails closed when a generated relative declaration import cannot resolve', async () => {
	const root = await createDeclarationFixture();
	try {
		await writeFile(path.join(root, 'index.d.ts'), "export * from './missing.js';\n");
		await assert.rejects(findUnreachableDeclarations(root), /cannot resolve.*\.\/missing\.js/);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});
