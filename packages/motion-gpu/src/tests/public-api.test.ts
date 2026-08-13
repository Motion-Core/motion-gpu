import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as advanced from '../lib/advanced';
import * as core from '../lib/core/index';
import type { ComputeResourceMap as CoreComputeResourceMap } from '../lib/core/index';
import * as coreAdvanced from '../lib/core/advanced';
import * as api from '../lib/index';
import type {
	ComputeResourceMap as RootComputeResourceMap,
	PingPongComputePassOptions
} from '../lib/index';
import * as react from '../lib/react/index';
import * as reactAdvanced from '../lib/react/advanced';
import type { ComputeResourceMap as ReactComputeResourceMap } from '../lib/react/index';
import * as svelte from '../lib/svelte/index';
import * as svelteAdvanced from '../lib/svelte/advanced';
import type {
	ComputeResourceMap as SvelteComputeResourceMap,
	TextureOptionsInput as SvelteTextureOptionsInput
} from '../lib/svelte/index';
import * as vue from '../lib/vue/index';
import * as vueAdvanced from '../lib/vue/advanced';
import type {
	ComputeResourceMap as VueComputeResourceMap,
	TextureOptionsInput as VueTextureOptionsInput
} from '../lib/vue/index';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function acceptReactiveTextureOptions(
	svelteOptions: SvelteTextureOptionsInput,
	vueOptions: VueTextureOptionsInput
): [SvelteTextureOptionsInput, VueTextureOptionsInput] {
	return [svelteOptions, vueOptions];
}

function acceptComputeResourceMaps(
	rootResources: RootComputeResourceMap,
	coreResources: CoreComputeResourceMap,
	svelteResources: SvelteComputeResourceMap,
	reactResources: ReactComputeResourceMap,
	vueResources: VueComputeResourceMap
): [
	RootComputeResourceMap,
	CoreComputeResourceMap,
	SvelteComputeResourceMap,
	ReactComputeResourceMap,
	VueComputeResourceMap
] {
	return [rootResources, coreResources, svelteResources, reactResources, vueResources];
}

function acceptRootComputeResourceMap(resources: RootComputeResourceMap): RootComputeResourceMap {
	return resources;
}

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
	it('exports one compute resource descriptor contract from every entrypoint', () => {
		const resources = {
			uCamera: { texture: 'camera', access: 'sampled', version: 'current' },
			uCameraSampler: { sampler: 'camera' },
			uMotion: { texture: 'motion', access: 'storage-write' },
			particles: { buffer: 'particles', access: 'storage-read' },
			forces: { buffer: 'forces', access: 'storage-read-write' }
		} as const satisfies RootComputeResourceMap;

		expect(
			acceptComputeResourceMaps(resources, resources, resources, resources, resources)
		).toEqual([resources, resources, resources, resources, resources]);
	});

	it('types borrowed WebGPU resources with stable resource identities', () => {
		const resources = {
			uExternal: {
				texture: {
					externalTexture: () => ({}) as GPUTexture,
					resourceId: Symbol('external-texture'),
					format: 'rgba8unorm',
					usage: 1 as GPUTextureUsageFlags
				},
				access: 'sampled'
			},
			uExternalSampler: {
				sampler: {
					externalSampler: () => ({}) as GPUSampler,
					resourceId: Symbol('external-sampler'),
					type: 'filtering'
				}
			}
		} as const satisfies RootComputeResourceMap;

		expect(
			acceptComputeResourceMaps(resources, resources, resources, resources, resources)
		).toEqual([resources, resources, resources, resources, resources]);
	});

	it('rejects incomplete or incompatible compute resource descriptors at compile time', () => {
		const missingResourceId = {
			uExternal: {
				texture: {
					externalTexture: {} as GPUTexture,
					format: 'rgba8unorm',
					usage: 1 as GPUTextureUsageFlags
				},
				access: 'sampled'
			}
		} as const;
		const incompatibleAccess = {
			uCamera: { texture: 'camera', access: 'storage-read' }
		} as const;

		// @ts-expect-error borrowed resources require a stable resourceId
		expect(acceptRootComputeResourceMap(missingResourceId)).toBe(missingResourceId);
		// @ts-expect-error texture descriptors cannot use storage-buffer access
		expect(acceptRootComputeResourceMap(incompatibleAccess)).toBe(incompatibleAccess);
	});

	it('accepts resources on compute passes and omits the old ping-pong target contract', () => {
		const resources = {
			uPrevious: { texture: 'simulation', access: 'sampled', pingPong: 'read' },
			uNext: { texture: 'simulation', access: 'storage-write', pingPong: 'write' }
		} as const satisfies RootComputeResourceMap;
		const compute =
			'@compute @workgroup_size(1) fn compute(@builtin(global_invocation_id) id: vec3u) {}';

		expect(new api.ComputePass({ compute, resources }).getResources()).toEqual(resources);
		expect(new api.PingPongComputePass({ compute, resources }).getResources()).toEqual(resources);

		const legacyOptions: PingPongComputePassOptions = {
			compute,
			resources,
			// @ts-expect-error target was removed in favor of explicit resource descriptors
			target: 'simulation'
		};
		expect(Object.keys(legacyOptions)).toContain('target');
	});

	it('exports reactive adapter texture option input types', () => {
		expect(acceptReactiveTextureOptions({}, {})).toEqual([{}, {}]);
		expect(
			acceptReactiveTextureOptions(
				() => ({}),
				() => ({})
			)
		).toHaveLength(2);
	});

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
