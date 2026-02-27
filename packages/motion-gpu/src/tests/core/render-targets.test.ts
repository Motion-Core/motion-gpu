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
});
