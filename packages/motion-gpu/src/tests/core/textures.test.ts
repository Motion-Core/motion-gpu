import { describe, expect, it } from 'vitest';
import {
	getTextureMipLevelCount,
	isVideoTextureSource,
	normalizeTextureDefinition,
	normalizeTextureDefinitions,
	resolveTextureUpdateMode,
	resolveTextureKeys,
	resolveTextureSize,
	toTextureData
} from '../../lib/core/textures';

describe('textures', () => {
	it('resolves sorted texture keys and validates names', () => {
		expect(resolveTextureKeys({ uTextureB: {}, uTextureA: {} })).toEqual([
			'uTextureA',
			'uTextureB'
		]);
		expect(() => resolveTextureKeys({ 'bad-key': {} })).toThrow(/Invalid uniform name/);
	});

	it('applies texture defaults', () => {
		expect(normalizeTextureDefinition(undefined)).toEqual({
			source: null,
			colorSpace: 'srgb',
			format: 'rgba8unorm-srgb',
			flipY: true,
			generateMipmaps: false,
			premultipliedAlpha: false,
			anisotropy: 1,
			filter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});

		expect(normalizeTextureDefinition({ update: 'onInvalidate' }).update).toBe('onInvalidate');
	});

	it('normalizes texture maps by key', () => {
		const normalized = normalizeTextureDefinitions(
			{
				uTexture1: { filter: 'nearest', flipY: false, anisotropy: 8, generateMipmaps: true },
				uTexture2: {
					addressModeU: 'repeat',
					addressModeV: 'mirror-repeat',
					premultipliedAlpha: true
				}
			},
			['uTexture1', 'uTexture2']
		);

		expect(normalized.uTexture1).toMatchObject({
			colorSpace: 'srgb',
			format: 'rgba8unorm-srgb',
			flipY: false,
			generateMipmaps: true,
			anisotropy: 8,
			filter: 'nearest',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});
		expect(normalized.uTexture2).toMatchObject({
			colorSpace: 'srgb',
			format: 'rgba8unorm-srgb',
			flipY: true,
			generateMipmaps: false,
			premultipliedAlpha: true,
			anisotropy: 1,
			filter: 'linear',
			addressModeU: 'repeat',
			addressModeV: 'mirror-repeat'
		});

		const clamped = normalizeTextureDefinition({ anisotropy: 999 });
		expect(clamped.anisotropy).toBe(16);
	});

	it('converts texture source values into texture data', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 8;
		canvas.height = 4;

		expect(toTextureData(null)).toBeNull();
		expect(toTextureData(canvas)).toEqual({ source: canvas });
		expect(toTextureData({ source: canvas, width: 3, height: 2 })).toEqual({
			source: canvas,
			width: 3,
			height: 2
		});
	});

	it('resolves texture size from source dimensions', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 16;
		canvas.height = 9;

		expect(resolveTextureSize({ source: canvas })).toEqual({ width: 16, height: 9 });
		expect(resolveTextureSize({ source: canvas, width: 4, height: 5 })).toEqual({
			width: 4,
			height: 5
		});
	});

	it('throws on invalid texture dimensions', () => {
		const canvas = document.createElement('canvas');
		expect(() => resolveTextureSize({ source: canvas, width: 0, height: 0 })).toThrow(
			/Texture source must have positive width and height/
		);
	});

	it('computes mip level count for texture sizes', () => {
		expect(getTextureMipLevelCount(1, 1)).toBe(1);
		expect(getTextureMipLevelCount(16, 16)).toBe(5);
		expect(getTextureMipLevelCount(1024, 512)).toBe(11);
	});

	it('detects video texture sources', () => {
		const video = document.createElement('video');
		const canvas = document.createElement('canvas');

		expect(isVideoTextureSource(video)).toBe(true);
		expect(isVideoTextureSource(canvas)).toBe(false);
	});

	it('resolves runtime texture update strategy', () => {
		const video = document.createElement('video');
		const canvas = document.createElement('canvas');

		expect(resolveTextureUpdateMode({ source: canvas })).toBe('once');
		expect(resolveTextureUpdateMode({ source: canvas, defaultMode: 'onInvalidate' })).toBe(
			'onInvalidate'
		);
		expect(resolveTextureUpdateMode({ source: canvas, override: 'perFrame' })).toBe('perFrame');
		expect(resolveTextureUpdateMode({ source: video })).toBe('perFrame');
	});
});
