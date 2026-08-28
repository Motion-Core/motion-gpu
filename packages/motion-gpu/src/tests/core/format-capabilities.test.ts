import { describe, expect, it } from 'vitest';
import {
	assertFloatSampledFormat,
	assertStorageTextureAccess,
	resolveTextureFormatCapabilities
} from '../../lib/core/format-capabilities.js';
import { toMotionGPUErrorReport } from '../../lib/core/error-report.js';

describe('texture format capability registry', () => {
	it.each([
		['rgba8unorm', 'float', true, true],
		['rgba16float', 'float', true, true],
		['rgba32float', 'unfilterable-float', false, true],
		['rgba8uint', 'uint', false, true],
		['rgba8sint', 'sint', false, true],
		['depth24plus', 'depth', false, true]
	] as const)(
		'classifies %s as sampleType=%s filterable=%s colorRenderable=%s',
		(format, sampleType, filterable, renderable) => {
			const capabilities = resolveTextureFormatCapabilities(format);
			expect(capabilities).toMatchObject({ sampleType, filterable, renderable });
		}
	);

	it('distinguishes depth renderability from color-attachment renderability', () => {
		expect(resolveTextureFormatCapabilities('depth24plus')).toMatchObject({
			renderable: true,
			colorRenderable: false
		});
	});

	it('promotes float32 sampling from unfilterable to filterable with the device feature', () => {
		const withoutFeature = resolveTextureFormatCapabilities('rgba32float', new Set());
		const withFeature = resolveTextureFormatCapabilities(
			'rgba32float',
			new Set(['float32-filterable'])
		);

		expect(withoutFeature).toMatchObject({
			sampleType: 'unfilterable-float',
			filterable: false
		});
		expect(withFeature).toMatchObject({ sampleType: 'float', filterable: true });
		expect(withFeature.requiredFeatures.filterable).toBe('float32-filterable');
	});

	it('applies tier feature dependencies to render and storage capabilities', () => {
		expect(resolveTextureFormatCapabilities('r8snorm').renderable).toBe(false);
		expect(
			resolveTextureFormatCapabilities('r8snorm', new Set(['texture-formats-tier1'])).renderable
		).toBe(true);
		expect(resolveTextureFormatCapabilities('r8unorm').storageAccess).toEqual([]);
		expect(
			resolveTextureFormatCapabilities('r8unorm', new Set(['texture-formats-tier1'])).storageAccess
		).toEqual(['write-only', 'read-only']);
		expect(
			resolveTextureFormatCapabilities('r8unorm', new Set(['texture-formats-tier2'])).storageAccess
		).toEqual(['write-only', 'read-only', 'read-write']);
		expect(
			resolveTextureFormatCapabilities('rg11b10ufloat', new Set(['texture-formats-tier1']))
				.renderable
		).toBe(true);
	});

	it('tracks format-level and storage-access feature requirements', () => {
		expect(resolveTextureFormatCapabilities('r16unorm')).toMatchObject({
			supported: false,
			renderable: false,
			requiredFeatures: { format: 'texture-formats-tier1' }
		});
		expect(
			resolveTextureFormatCapabilities('r16unorm', new Set(['texture-formats-tier1']))
		).toMatchObject({ supported: true, renderable: true, sampleType: 'unfilterable-float' });
		expect(resolveTextureFormatCapabilities('bgra8unorm').storageAccess).toEqual([]);
		expect(
			resolveTextureFormatCapabilities('bgra8unorm', new Set(['bgra8unorm-storage'])).storageAccess
		).toEqual(['write-only']);
		expect(resolveTextureFormatCapabilities('r32float').storageAccess).toEqual([
			'write-only',
			'read-only',
			'read-write'
		]);
	});

	it.each(['rgba8uint', 'rgba8sint', 'depth24plus'] as const)(
		'reports an early classified float-sampling error for %s',
		(format) => {
			let thrown: unknown;
			try {
				assertFloatSampledFormat({
					format,
					target: 'fxInput',
					pass: 'BlitPass',
					deviceFeatures: new Set()
				});
			} catch (error) {
				thrown = error;
			}

			const report = toMotionGPUErrorReport(thrown, 'render');
			expect(report.code).toBe('FORMAT_CAPABILITY_MISSING');
			expect(report.message).toContain('target "fxInput"');
			expect(report.message).toContain(`format "${format}"`);
			expect(report.message).toContain('BlitPass');
			expect(report.message).toContain('float texture sampling');
		}
	);

	it('reports the missing storage feature before storage use', () => {
		expect(() =>
			assertStorageTextureAccess({
				format: 'bgra8unorm',
				target: 'uOutput',
				pass: 'Compute pass #0',
				access: 'write-only',
				deviceFeatures: new Set()
			})
		).toThrow(/bgra8unorm-storage/);
	});
});
