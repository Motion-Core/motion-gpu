import { describe, expect, it } from 'vitest';
import { defineMaterial, resolveMaterial } from '../../lib/core/material';
import { normalizeTextureDefinition } from '../../lib/core/textures';

describe('texture fragment visibility', () => {
	it('defaults fragmentVisible to true when omitted', () => {
		const normalized = normalizeTextureDefinition({
			storage: true,
			format: 'rgba8unorm',
			width: 8,
			height: 8
		});

		expect(normalized).toMatchObject({ fragmentVisible: true });
	});

	it('material signature changes when fragmentVisible changes', () => {
		const fragment = 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }';
		const materialVisible = defineMaterial({
			fragment,
			textures: {
				computeOutput: {
					storage: true,
					format: 'rgba8unorm',
					width: 16,
					height: 16,
					fragmentVisible: true
				}
			}
		});
		const materialHidden = defineMaterial({
			fragment,
			textures: {
				computeOutput: {
					storage: true,
					format: 'rgba8unorm',
					width: 16,
					height: 16,
					fragmentVisible: false
				}
			}
		});

		const visibleResolved = resolveMaterial(materialVisible);
		const hiddenResolved = resolveMaterial(materialHidden);

		expect(visibleResolved.signature).not.toBe(hiddenResolved.signature);
	});
});
