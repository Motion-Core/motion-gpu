import { describe, expect, it } from 'vitest';
import {
	assertStorageBufferDefinition,
	assertStorageTextureFormat,
	normalizeStorageBufferDefinition,
	resolveStorageBufferKeys,
	STORAGE_TEXTURE_FORMATS
} from '../../lib/core/storage-buffers';
import type { StorageBufferDefinition } from '../../lib/core/types';

describe('storage buffer validation', () => {
	it('accepts valid storage buffer definition (size=1024, type=array<vec4f>)', () => {
		expect(() =>
			assertStorageBufferDefinition('particles', {
				size: 1024,
				type: 'array<vec4f>',
				access: 'read-write'
			})
		).not.toThrow();
	});

	it('rejects size <= 0', () => {
		expect(() => assertStorageBufferDefinition('buf', { size: 0, type: 'array<f32>' })).toThrow(
			/greater than 0/
		);

		expect(() => assertStorageBufferDefinition('buf', { size: -4, type: 'array<f32>' })).toThrow(
			/greater than 0/
		);
	});

	it('rejects size not multiple of 4', () => {
		expect(() => assertStorageBufferDefinition('buf', { size: 7, type: 'array<f32>' })).toThrow(
			/multiple of 4/
		);
	});

	it('rejects non-finite size (NaN, Infinity)', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', { size: Number.NaN, type: 'array<f32>' })
		).toThrow(/greater than 0/);

		expect(() =>
			assertStorageBufferDefinition('buf', { size: Number.POSITIVE_INFINITY, type: 'array<f32>' })
		).toThrow(/greater than 0/);
	});

	it('rejects unknown type string', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 16,
				type: 'array<mat4x4f>' as StorageBufferDefinition['type']
			})
		).toThrow(/unknown type/);
	});

	it('rejects invalid WGSL identifier name', () => {
		expect(() => assertStorageBufferDefinition('123bad', { size: 16, type: 'array<f32>' })).toThrow(
			/Invalid uniform name/
		);
	});

	it('normalizes access to read-write when omitted', () => {
		const normalized = normalizeStorageBufferDefinition({
			size: 64,
			type: 'array<vec4f>'
		});
		expect(normalized.access).toBe('read-write');
	});

	it('preserves explicit access value', () => {
		const normalized = normalizeStorageBufferDefinition({
			size: 64,
			type: 'array<vec4f>',
			access: 'read'
		});
		expect(normalized.access).toBe('read');
	});

	it('sorts keys deterministically', () => {
		const keys = resolveStorageBufferKeys({
			zBuf: { size: 16, type: 'array<f32>' },
			aBuf: { size: 32, type: 'array<vec4f>' },
			mBuf: { size: 64, type: 'array<u32>' }
		});
		expect(keys).toEqual(['aBuf', 'mBuf', 'zBuf']);
	});

	it('validates initialData length matches size', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 64,
				type: 'array<f32>',
				initialData: new Float32Array(16) // 64 bytes exactly
			})
		).not.toThrow();
	});

	it('rejects initialData byte length exceeding size', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 32,
				type: 'array<f32>',
				initialData: new Float32Array(16) // 64 bytes > 32
			})
		).toThrow(/exceeds buffer size/);
	});

	it('rejects invalid access mode string', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 16,
				type: 'array<f32>',
				access: 'write' as unknown as NonNullable<StorageBufferDefinition['access']>
			})
		).toThrow(/invalid access mode/);

		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 16,
				type: 'array<f32>',
				access: 'write-only' as unknown as NonNullable<StorageBufferDefinition['access']>
			})
		).toThrow(/invalid access mode/);
	});

	it('accepts initialData smaller than buffer size (partial fill)', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 64,
				type: 'array<f32>',
				initialData: new Float32Array(4) // 16 bytes < 64
			})
		).not.toThrow();
	});

	it('accepts empty initialData (zero-length typed array)', () => {
		expect(() =>
			assertStorageBufferDefinition('buf', {
				size: 16,
				type: 'array<f32>',
				initialData: new Float32Array(0)
			})
		).not.toThrow();
	});

	it('skips undefined definitions in resolveStorageBufferKeys', () => {
		const keys = resolveStorageBufferKeys({
			aBuf: { size: 16, type: 'array<f32>' },
			bBuf: undefined as unknown as StorageBufferDefinition
		});
		expect(keys).toEqual(['aBuf', 'bBuf']);
	});

	it('normalizeStorageBufferDefinition excludes initialData from output', () => {
		const normalized = normalizeStorageBufferDefinition({
			size: 64,
			type: 'array<vec4f>',
			initialData: new Float32Array(16)
		});
		expect(normalized).not.toHaveProperty('initialData');
		expect(normalized).toEqual({
			size: 64,
			type: 'array<vec4f>',
			access: 'read-write'
		});
	});
});

describe('storage texture format validation', () => {
	it('accepts rgba8unorm for storage texture', () => {
		expect(() => assertStorageTextureFormat('tex', 'rgba8unorm')).not.toThrow();
	});

	it('accepts rgba16float for storage texture', () => {
		expect(() => assertStorageTextureFormat('tex', 'rgba16float')).not.toThrow();
	});

	it('accepts r32float for storage texture', () => {
		expect(() => assertStorageTextureFormat('tex', 'r32float')).not.toThrow();
	});

	it('accepts rg32float for storage texture', () => {
		expect(() => assertStorageTextureFormat('tex', 'rg32float')).not.toThrow();
	});

	it('accepts rgba32float for storage texture', () => {
		expect(() => assertStorageTextureFormat('tex', 'rgba32float')).not.toThrow();
	});

	it('rejects rgba8unorm-srgb (not storage-compatible)', () => {
		expect(() => assertStorageTextureFormat('tex', 'rgba8unorm-srgb')).toThrow(
			/storage-compatible format/
		);
	});

	it('rejects depth24plus (not storage-compatible)', () => {
		expect(() => assertStorageTextureFormat('tex', 'depth24plus')).toThrow(
			/storage-compatible format/
		);
	});

	it('STORAGE_TEXTURE_FORMATS set is non-empty and frozen-like', () => {
		expect(STORAGE_TEXTURE_FORMATS.size).toBeGreaterThan(0);
		expect(STORAGE_TEXTURE_FORMATS.has('rgba8unorm')).toBe(true);
		expect(STORAGE_TEXTURE_FORMATS.has('rgba8unorm-srgb' as GPUTextureFormat)).toBe(false);
	});
});
