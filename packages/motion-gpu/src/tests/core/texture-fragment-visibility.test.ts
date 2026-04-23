import { describe, expect, it } from 'vitest';
import { defineMaterial, resolveMaterial } from '../../lib/core/material';
import { normalizeTextureDefinition } from '../../lib/core/textures';

describe('texture fragment visibility', () => {
	it('defaults fragmentVisible to true for float storage textures', () => {
		const normalized = normalizeTextureDefinition({
			storage: true,
			format: 'rgba8unorm',
			width: 8,
			height: 8
		});

		expect(normalized).toMatchObject({ fragmentVisible: true });
	});

	it('defaults fragmentVisible to false for uint storage textures', () => {
		const normalized = normalizeTextureDefinition({
			storage: true,
			format: 'r32uint',
			width: 8,
			height: 8
		});

		expect(normalized.fragmentVisible).toBe(false);
	});

	it('defaults fragmentVisible to false for sint storage textures', () => {
		const normalized = normalizeTextureDefinition({
			storage: true,
			format: 'rgba16sint',
			width: 8,
			height: 8
		});

		expect(normalized.fragmentVisible).toBe(false);
	});

	it('respects explicit fragmentVisible=false on float storage textures', () => {
		const normalized = normalizeTextureDefinition({
			storage: true,
			format: 'rgba16float',
			width: 8,
			height: 8,
			fragmentVisible: false
		});

		expect(normalized.fragmentVisible).toBe(false);
	});

	it('rejects explicit fragmentVisible=true on uint storage textures', () => {
		expect(() =>
			normalizeTextureDefinition({
				storage: true,
				format: 'r32uint',
				width: 8,
				height: 8,
				fragmentVisible: true
			})
		).toThrow(/r32uint.*fragmentVisible|fragmentVisible.*r32uint/i);
	});

	it('rejects explicit fragmentVisible=true on sint storage textures', () => {
		expect(() =>
			normalizeTextureDefinition({
				storage: true,
				format: 'rgba32sint',
				width: 8,
				height: 8,
				fragmentVisible: true
			})
		).toThrow(/rgba32sint.*fragmentVisible|fragmentVisible.*rgba32sint/i);
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
