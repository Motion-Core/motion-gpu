import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as advanced from '../lib/advanced';
import * as core from '../lib/core/index';
import * as coreAdvanced from '../lib/core/advanced';
import * as api from '../lib/index';
import * as react from '../lib/react/index';
import * as reactAdvanced from '../lib/react/advanced';
import * as svelte from '../lib/svelte/index';
import * as svelteAdvanced from '../lib/svelte/advanced';
import * as vue from '../lib/vue/index';
import * as vueAdvanced from '../lib/vue/advanced';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readPackageJson(): {
	exports: Record<string, { types: string; default: string; svelte?: string }>;
} {
	return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
		exports: Record<string, { types: string; default: string; svelte?: string }>;
	};
}

function sourceEntryForDistPath(distPath: string): string {
	return path.join(
		packageRoot,
		distPath
			.replace(/^\.\//, '')
			.replace(/^dist\//, 'src/lib/')
			.replace(/\.js$/, '.ts')
	);
}

describe('public api contract', () => {
	it('exports framework-agnostic runtime symbols from root and /core entrypoints', () => {
		expect(Object.keys(api).sort()).toEqual([
			'BlitPass',
			'ComputePass',
			'CopyPass',
			'PingPongComputePass',
			'PingPongShaderPass',
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
			'ComputePass',
			'CopyPass',
			'PingPongComputePass',
			'PingPongShaderPass',
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
			'ComputePass',
			'CopyPass',
			'FragCanvas',
			'PingPongComputePass',
			'PingPongShaderPass',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'usePointer',
			'useTexture'
		]);
		expect(Object.keys(svelteAdvanced).sort()).toEqual([
			'BlitPass',
			'ComputePass',
			'CopyPass',
			'FragCanvas',
			'PingPongComputePass',
			'PingPongShaderPass',
			'ShaderPass',
			'applySchedulerPreset',
			'captureSchedulerDebugSnapshot',
			'defineMaterial',
			'setMotionGPUUserContext',
			'useFrame',
			'useMotionGPU',
			'useMotionGPUUserContext',
			'usePointer',
			'useTexture'
		]);
	});

	it('exposes React runtime symbols only from adapter entrypoints', () => {
		expect(Object.keys(react).sort()).toEqual([
			'BlitPass',
			'ComputePass',
			'CopyPass',
			'FragCanvas',
			'PingPongComputePass',
			'PingPongShaderPass',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'usePointer',
			'useTexture'
		]);
		expect(Object.keys(reactAdvanced).sort()).toEqual([
			'BlitPass',
			'ComputePass',
			'CopyPass',
			'FragCanvas',
			'PingPongComputePass',
			'PingPongShaderPass',
			'ShaderPass',
			'applySchedulerPreset',
			'captureSchedulerDebugSnapshot',
			'defineMaterial',
			'setMotionGPUUserContext',
			'useFrame',
			'useMotionGPU',
			'useMotionGPUUserContext',
			'usePointer',
			'useSetMotionGPUUserContext',
			'useTexture'
		]);
	});

	it('exposes Vue runtime symbols only from adapter entrypoints', () => {
		expect(Object.keys(vue).sort()).toEqual([
			'BlitPass',
			'ComputePass',
			'CopyPass',
			'FragCanvas',
			'PingPongComputePass',
			'PingPongShaderPass',
			'ShaderPass',
			'defineMaterial',
			'useFrame',
			'useMotionGPU',
			'usePointer',
			'useTexture'
		]);
		expect(Object.keys(vueAdvanced).sort()).toEqual([
			'BlitPass',
			'ComputePass',
			'CopyPass',
			'FragCanvas',
			'PingPongComputePass',
			'PingPongShaderPass',
			'ShaderPass',
			'applySchedulerPreset',
			'captureSchedulerDebugSnapshot',
			'defineMaterial',
			'setMotionGPUUserContext',
			'useFrame',
			'useMotionGPU',
			'useMotionGPUUserContext',
			'usePointer',
			'useTexture'
		]);
	});

	it('keeps package export declarations aligned with source entrypoints', () => {
		const packageJson = readPackageJson();
		const exportEntries = Object.entries(packageJson.exports);
		expect(exportEntries.map(([key]) => key).sort()).toEqual([
			'.',
			'./advanced',
			'./core',
			'./core/advanced',
			'./react',
			'./react/advanced',
			'./svelte',
			'./svelte/advanced',
			'./vue',
			'./vue/advanced'
		]);

		for (const [exportName, exportConfig] of exportEntries) {
			expect(exportConfig.types, exportName).toMatch(/^\.\/dist\/.+\.d\.ts$/);
			expect(exportConfig.default, exportName).toMatch(/^\.\/dist\/.+\.js$/);
			expect(exportConfig.types, exportName).toBe(exportConfig.default.replace(/\.js$/, '.d.ts'));
			expect(() =>
				readFileSync(sourceEntryForDistPath(exportConfig.default), 'utf8')
			).not.toThrow();

			if (exportName.startsWith('./svelte')) {
				expect(exportConfig.svelte, exportName).toBe(exportConfig.default);
			} else {
				expect(exportConfig.svelte, exportName).toBeUndefined();
			}
		}
	});
});
