import { describe, expect, it } from 'vitest';
import * as advanced from '../lib/advanced';
import * as core from '../lib/core/index';
import * as coreAdvanced from '../lib/core/advanced';
import * as api from '../lib/index';
import * as react from '../lib/react/index';
import * as reactAdvanced from '../lib/react/advanced';
import * as svelte from '../lib/svelte/index';
import * as svelteAdvanced from '../lib/svelte/advanced';

describe('public api contract', () => {
	it('exports framework-agnostic runtime symbols from root and /core entrypoints', () => {
		expect(Object.keys(api).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'ShaderPass',
			'createCurrentWritable',
			'createFrameRegistry',
			'createMotionGPURuntimeLoop',
			'defineMaterial',
			'loadTexturesFromUrls',
			'resolveMaterial',
			'toMotionGPUErrorReport'
		]);
		expect(Object.keys(core).sort()).toEqual(Object.keys(api).sort());
	});

	it('exposes framework-agnostic advanced symbols from root /advanced and /core/advanced', () => {
		expect(Object.keys(advanced).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'ShaderPass',
			'applySchedulerPreset',
			'captureSchedulerDebugSnapshot',
			'createCurrentWritable',
			'createFrameRegistry',
			'createMotionGPURuntimeLoop',
			'defineMaterial',
			'loadTexturesFromUrls',
			'resolveMaterial',
			'toMotionGPUErrorReport'
		]);
		expect(Object.keys(coreAdvanced).sort()).toEqual(Object.keys(advanced).sort());
	});

	it('exposes Svelte runtime symbols only from adapter entrypoints', () => {
		expect(Object.keys(svelte).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'FragCanvas',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'useTexture'
		]);
		expect(Object.keys(svelteAdvanced).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'FragCanvas',
			'ShaderPass',
			'applySchedulerPreset',
			'captureSchedulerDebugSnapshot',
			'defineMaterial',
			'setMotionGPUUserContext',
			'useFrame',
			'useMotionGPU',
			'useMotionGPUUserContext',
			'useTexture'
		]);
	});

	it('exposes React runtime symbols only from adapter entrypoints', () => {
		expect(Object.keys(react).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'FragCanvas',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'useTexture'
		]);
		expect(Object.keys(reactAdvanced).sort()).toEqual([
			'BlitPass',
			'CopyPass',
			'FragCanvas',
			'ShaderPass',
			'applySchedulerPreset',
			'captureSchedulerDebugSnapshot',
			'defineMaterial',
			'setMotionGPUUserContext',
			'useFrame',
			'useMotionGPU',
			'useMotionGPUUserContext',
			'useTexture'
		]);
	});
});
