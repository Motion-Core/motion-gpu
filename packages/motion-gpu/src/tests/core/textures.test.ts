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
import type { TextureSource } from '../../lib/core/types';

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
			addressModeV: 'clamp-to-edge',
			storage: false
		});

		expect(normalizeTextureDefinition({ update: 'onInvalidate' }).update).toBe('onInvalidate');
	});

	it('normalizes texture maps by key', () => {
		const normalized = normalizeTextureDefinitions(
			{
				uTexture1: {
					filter: 'nearest',
					flipY: false,
					anisotropy: 8,
					generateMipmaps: true
				},
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

		expect(resolveTextureSize({ source: canvas })).toEqual({
			width: 16,
			height: 9
		});
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

	it('normalizes storage texture definitions with width, height and format', () => {
		const storageDef = normalizeTextureDefinition({
			storage: true,
			format: 'rgba16float',
			width: 512,
			height: 256
		});

		expect(storageDef.storage).toBe(true);
		expect(storageDef.format).toBe('rgba16float');
		expect(storageDef.width).toBe(512);
		expect(storageDef.height).toBe(256);
	});

	it('sets storage to false when not specified', () => {
		expect(normalizeTextureDefinition(undefined).storage).toBe(false);
		expect(normalizeTextureDefinition({}).storage).toBe(false);
		expect(normalizeTextureDefinition({ filter: 'nearest' }).storage).toBe(false);
	});

	it('preserves explicit format from definition instead of deriving from colorSpace', () => {
		const withFormat = normalizeTextureDefinition({ format: 'r32float' });
		expect(withFormat.format).toBe('r32float');

		const withoutFormat = normalizeTextureDefinition({ colorSpace: 'linear' });
		expect(withoutFormat.format).toBe('rgba8unorm');
	});

	it('omits width and height when not provided', () => {
		const norm = normalizeTextureDefinition(undefined);
		expect(norm).not.toHaveProperty('width');
		expect(norm).not.toHaveProperty('height');
	});

	it('normalizes storage textures in bulk via normalizeTextureDefinitions', () => {
		const normalized = normalizeTextureDefinitions(
			{
				uDensity: {
					storage: true,
					format: 'rgba16float',
					width: 256,
					height: 256
				},
				uRegular: {}
			},
			['uDensity', 'uRegular']
		);

		expect(normalized.uDensity!.storage).toBe(true);
		expect(normalized.uDensity!.width).toBe(256);
		expect(normalized.uDensity!.format).toBe('rgba16float');
		expect(normalized.uRegular!.storage).toBe(false);
		expect(normalized.uRegular!).not.toHaveProperty('width');
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

	it('clamps anisotropy at lower bound to 1', () => {
		expect(normalizeTextureDefinition({ anisotropy: 0 }).anisotropy).toBe(1);
		expect(normalizeTextureDefinition({ anisotropy: -5 }).anisotropy).toBe(1);
		expect(normalizeTextureDefinition({ anisotropy: -100 }).anisotropy).toBe(1);
	});

	it('floors fractional anisotropy values', () => {
		expect(normalizeTextureDefinition({ anisotropy: 3.7 }).anisotropy).toBe(3);
		expect(normalizeTextureDefinition({ anisotropy: 15.9 }).anisotropy).toBe(15);
		expect(normalizeTextureDefinition({ anisotropy: 1.1 }).anisotropy).toBe(1);
	});

	it('resolves texture size from naturalWidth/naturalHeight (image-like source)', () => {
		const img = { naturalWidth: 200, naturalHeight: 100 };
		expect(resolveTextureSize({ source: img as unknown as TextureSource })).toEqual({
			width: 200,
			height: 100
		});
	});

	it('resolves texture size from videoWidth/videoHeight', () => {
		const video = { videoWidth: 1920, videoHeight: 1080 };
		expect(resolveTextureSize({ source: video as unknown as TextureSource })).toEqual({
			width: 1920,
			height: 1080
		});
	});

	it('computes mip levels for non-power-of-two dimensions', () => {
		expect(getTextureMipLevelCount(300, 200)).toBe(9);
		expect(getTextureMipLevelCount(100, 1)).toBe(7);
		expect(getTextureMipLevelCount(1, 100)).toBe(7);
	});

	it('throws on source with no dimension properties', () => {
		expect(() => resolveTextureSize({ source: {} as unknown as TextureSource })).toThrow(
			/positive width and height/
		);
	});
});
