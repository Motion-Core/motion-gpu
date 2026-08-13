import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeImportBoundaries, extractImportSpecifiers } from './import-boundaries.mjs';

test('extracts static, re-export and dynamic import specifiers', () => {
	assert.deepEqual(
		extractImportSpecifiers(`
			import './side-effect.js';
			export { value } from './value.js';
			const lazy = import('./lazy.js');
		`),
		['./side-effect.js', './value.js', './lazy.js']
	);
});

test('rejects cycles including type-only imports', () => {
	const result = analyzeImportBoundaries({
		libraryFiles: new Map([
			['core/a.ts', `import type { B } from './b.js'; export type A = B;`],
			['core/b.ts', `import type { A } from './a.js'; export type B = A;`]
		])
	});

	assert.match(result.violations.join('\n'), /dependency cycle: core\/a\.ts -> core\/b\.ts/);
});

test('does not treat an inline self-referential type query as a module cycle', () => {
	const result = analyzeImportBoundaries({
		libraryFiles: new Map([['core/types.ts', `export type Self = import('./types.js').Self;`]])
	});

	assert.deepEqual(result.violations, []);
});

test('rejects core-to-adapter and sibling-adapter imports', () => {
	const result = analyzeImportBoundaries({
		libraryFiles: new Map([
			['core/runtime.ts', `import '../react/FragCanvas.js';`],
			['react/FragCanvas.tsx', `import '../vue/FragCanvas.js';`],
			['vue/FragCanvas.ts', `export const vue = true;`]
		])
	});

	assert.match(result.violations.join('\n'), /core cannot import adapter/);
	assert.match(result.violations.join('\n'), /react cannot import sibling adapter/);
});

test('rejects application imports from source or distribution internals', () => {
	const result = analyzeImportBoundaries({
		libraryFiles: new Map(),
		consumerFiles: new Map([
			[
				'apps/web/src/example.ts',
				`import '@motion-core/motion-gpu/src/lib/core/renderer.js';\nimport '../../packages/motion-gpu/dist/index.js';`
			]
		])
	});

	assert.equal(result.violations.length, 2);
	assert.match(result.violations.join('\n'), /consumer cannot import package internal/);
});
