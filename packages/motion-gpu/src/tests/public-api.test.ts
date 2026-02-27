import { describe, expect, it } from 'vitest';
import * as advanced from '../lib/advanced';
import * as api from '../lib/index';

describe('public api contract', () => {
	it('exports only the core runtime symbols from root entrypoint', () => {
		expect(Object.keys(api).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'FragCanvas',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'useTexture'
		]);
	});

	it('exposes extended runtime symbols from advanced entrypoint', () => {
		expect(Object.keys(advanced).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'FragCanvas',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'useMotionGPUUserContext',
			'useTexture'
		]);
	});
});
