import { describe, expect, it } from 'vitest';
import {
	buildRenderTargetSignature,
	resolveRenderTargetDefinitions
} from '../../lib/core/render-targets';

describe('render targets', () => {
	it('resolves sorted target definitions with defaults', () => {
		const resolved = resolveRenderTargetDefinitions(
			{
				uHalf: { scale: 0.5 },
				uFixed: { width: 320, height: 200, format: 'rgba16float' }
			},
			1000,
			800,
			'rgba8unorm-srgb'
		);

		expect(resolved).toEqual([
			{
				key: 'uFixed',
				width: 320,
				height: 200,
				format: 'rgba16float'
			},
			{
				key: 'uHalf',
				width: 500,
				height: 400,
				format: 'rgba8unorm-srgb'
			}
		]);
	});

	it('uses explicit dimensions when provided', () => {
		const resolved = resolveRenderTargetDefinitions(
			{
				uA: { width: 127.7, scale: 0.25 },
				uB: { height: 90.9, scale: 0.25 }
			},
			400,
			300,
			'rgba8unorm'
		);

		expect(resolved[0]).toMatchObject({ key: 'uA', width: 127, height: 75 });
		expect(resolved[1]).toMatchObject({ key: 'uB', width: 100, height: 90 });
	});

	it('throws on invalid definitions', () => {
		expect(() => resolveRenderTargetDefinitions({ 'bad-key': {} }, 200, 100, 'rgba8unorm')).toThrow(
			/Invalid uniform name/
		);

		expect(() =>
			resolveRenderTargetDefinitions({ uA: { scale: 0 } }, 200, 100, 'rgba8unorm')
		).toThrow(/RenderTarget scale/);

		expect(() =>
			resolveRenderTargetDefinitions({ uA: { width: -1 } }, 200, 100, 'rgba8unorm')
		).toThrow(/RenderTarget dimension/);
	});

	it('builds deterministic signatures', () => {
		const signature = buildRenderTargetSignature([
			{ key: 'uA', width: 100, height: 100, format: 'rgba8unorm' },
			{ key: 'uB', width: 200, height: 100, format: 'rgba16float' }
		]);

		expect(signature).toBe('uA:rgba8unorm:100x100|uB:rgba16float:200x100');
	});

	it('returns empty array for undefined definitions', () => {
		const resolved = resolveRenderTargetDefinitions(undefined, 800, 600, 'rgba8unorm');
		expect(resolved).toEqual([]);
	});

	it('returns empty array for null definitions', () => {
		const resolved = resolveRenderTargetDefinitions(
			null as unknown as Parameters<typeof resolveRenderTargetDefinitions>[0],
			800,
			600,
			'rgba8unorm'
		);
		expect(resolved).toEqual([]);
	});

	it('clamps small scaled dimensions to minimum 1', () => {
		const resolved = resolveRenderTargetDefinitions({ uTiny: { scale: 0.5 } }, 1, 1, 'rgba8unorm');
		expect(resolved[0]).toMatchObject({ key: 'uTiny', width: 1, height: 1 });
	});

	it('supports scale > 1 (upscaling)', () => {
		const resolved = resolveRenderTargetDefinitions({ uUp: { scale: 2 } }, 400, 300, 'rgba8unorm');
		expect(resolved[0]).toMatchObject({ key: 'uUp', width: 800, height: 600 });
	});

	it('handles fractional scale values correctly', () => {
		const resolved = resolveRenderTargetDefinitions(
			{ uFrac: { scale: 0.333 } },
			1000,
			1000,
			'rgba8unorm'
		);
		expect(resolved[0]).toMatchObject({ key: 'uFrac', width: 333, height: 333 });
	});

	it('rejects NaN and Infinity for explicit dimensions', () => {
		expect(() =>
			resolveRenderTargetDefinitions({ uA: { width: Number.NaN } }, 200, 100, 'rgba8unorm')
		).toThrow(/RenderTarget dimension/);

		expect(() =>
			resolveRenderTargetDefinitions(
				{ uA: { width: Number.POSITIVE_INFINITY } },
				200,
				100,
				'rgba8unorm'
			)
		).toThrow(/RenderTarget dimension/);
	});

	it('returns empty string for empty signature input', () => {
		expect(buildRenderTargetSignature([])).toBe('');
	});

	it('returns empty array for empty definitions map', () => {
		const resolved = resolveRenderTargetDefinitions({}, 800, 600, 'rgba8unorm');
		expect(resolved).toEqual([]);
	});
});
