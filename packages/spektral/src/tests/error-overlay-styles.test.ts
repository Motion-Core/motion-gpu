import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sharedStylesPath = path.join(packageRoot, 'src/lib/spektral.css');
const overlayPaths = [
	'src/lib/svelte/SpektralErrorOverlay.svelte',
	'src/lib/react/SpektralErrorOverlay.tsx',
	'src/lib/vue/SpektralErrorOverlay.vue'
] as const;

describe('error overlay stylesheet contract', () => {
	it('uses one shared stylesheet from every framework overlay', () => {
		const styles = readFileSync(sharedStylesPath, 'utf8');
		expect(styles.match(/--spektral-surface-gap\s*:/g)).toHaveLength(1);

		for (const overlayPath of overlayPaths) {
			const source = readFileSync(path.join(packageRoot, overlayPath), 'utf8');
			expect(source, overlayPath).toContain("import '../spektral.css';");
			expect(source, overlayPath).not.toContain('--spektral-surface-gap:');
			expect(source, overlayPath).not.toMatch(/<style(?:\s|>)/);
			expect(source, overlayPath).not.toContain('SPEKTRAL_ERROR_OVERLAY_STYLES');
		}
	});

	it('defines every Spektral custom property referenced by the stylesheet', () => {
		const styles = readFileSync(sharedStylesPath, 'utf8');
		const definitions = new Set(
			Array.from(styles.matchAll(/(--spektral-[a-z0-9-]+)\s*:/g), (match) => match[1])
		);
		const references = new Set(
			Array.from(styles.matchAll(/var\((--spektral-[a-z0-9-]+)/g), (match) => match[1])
		);

		expect([...references].filter((property) => !definitions.has(property))).toEqual([]);
	});
});
