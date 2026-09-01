import { describe, expect, it, vi } from 'vitest';
import {
	getComputePassStaticTopology,
	observeComputePassStaticTopologyForTests,
	type ComputePassStaticTopologyEvent
} from '../../lib/core/compute-pass-static-topology';
import type { ComputeResourceMap } from '../../lib/core/types';
import { ComputePass } from '../../lib/passes/ComputePass';

const validCompute = `
@compute @workgroup_size(256)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let index = id.x;
}
`;

const validCompute2D = `
@compute @workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
	let y = id.y;
}
`;

describe('ComputePass', () => {
	it('allocates one deeply immutable topology that remains stable across shader state changes', () => {
		const events: ComputePassStaticTopologyEvent[] = [];
		const stopObserving = observeComputePassStaticTopologyForTests((event) => events.push(event));
		try {
			const pass = new ComputePass({
				compute: validCompute,
				resources: {
					uInput: {
						texture: 'camera',
						access: 'sampled',
						view: { baseMipLevel: 1 }
					}
				}
			});
			const topology = getComputePassStaticTopology(pass);
			const publicResources = pass.getResources();

			expect(events.map((event) => event.type)).toEqual(['normalized', 'allocated']);
			expect(events[1]?.topology).toBe(topology);
			expect(topology.kind).toBe('compute');
			expect(Object.isFrozen(topology)).toBe(true);
			expect(Object.isFrozen(topology.resources)).toBe(true);
			expect(Object.isFrozen(topology.resources.uInput)).toBe(true);
			const input = topology.resources.uInput;
			expect(input && 'texture' in input && Object.isFrozen(input.view)).toBe(true);
			expect(publicResources).not.toBe(topology.resources);
			expect(publicResources.uInput).not.toBe(topology.resources.uInput);

			pass.setCompute(validCompute2D);
			pass.setDispatch([4, 2]);
			expect(getComputePassStaticTopology(pass)).toBe(topology);
			expect(events.map((event) => event.type)).toEqual(['normalized', 'allocated']);

			const mutableCopy = publicResources as Record<string, ComputeResourceMap[string]>;
			delete mutableCopy.uInput;
			expect(topology.resources.uInput).toBeDefined();
		} finally {
			stopObserving();
		}
	});

	it('rejects invalid resources before allocating a topology descriptor', () => {
		const events: ComputePassStaticTopologyEvent[] = [];
		const stopObserving = observeComputePassStaticTopologyForTests((event) => events.push(event));
		try {
			expect(
				() =>
					new ComputePass({
						compute: validCompute,
						resources: {
							uInput: { texture: 'camera', access: 'invalid' }
						} as unknown as ComputeResourceMap
					})
			).toThrow(/texture access/);
			expect(events).toEqual([]);
		} finally {
			stopObserving();
		}
	});

	it('creates with valid compute shader', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.enabled).toBe(true);
		expect(pass.isCompute).toBe(true);
		expect(pass.getCompute()).toBe(validCompute);
	});

	it('defaults resources to an empty map', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.getResources()).toEqual({});
	});

	it('sorts aliases and captures a defensive topology snapshot', () => {
		const resources: Record<string, ComputeResourceMap[string]> = {
			zOutput: { texture: 'motion', access: 'storage-write' },
			aInput: { texture: 'camera', access: 'sampled', view: { baseMipLevel: 1 } }
		};
		const pass = new ComputePass({ compute: validCompute, resources });
		resources.extra = { sampler: 'camera' };
		delete resources.aInput;

		const first = pass.getResources() as Record<string, ComputeResourceMap[string]>;
		expect(Object.keys(first)).toEqual(['aInput', 'zOutput']);
		first.extra = { sampler: 'camera' };
		delete first.aInput;
		const sampled = pass.getResources().aInput;
		if (sampled && 'texture' in sampled && sampled.view) {
			(sampled.view as { baseMipLevel?: number }).baseMipLevel = 9;
		}

		expect(pass.getResources()).toEqual({
			aInput: { texture: 'camera', access: 'sampled', view: { baseMipLevel: 1 } },
			zOutput: { texture: 'motion', access: 'storage-write' }
		});
	});

	it('rejects invalid and renderer-reserved aliases', () => {
		expect(
			() =>
				new ComputePass({
					compute: validCompute,
					resources: { 'not-valid': { texture: 'camera', access: 'sampled' } }
				})
		).toThrow(/Invalid uniform name/);
		for (const alias of ['spektralFrame', 'spektralUniforms']) {
			expect(
				() =>
					new ComputePass({
						compute: validCompute,
						resources: { [alias]: { texture: 'camera', access: 'sampled' } }
					})
			).toThrow(/reserved by Spektral/);
		}
	});

	it('rejects ambiguous descriptors and unsupported fields', () => {
		const ambiguous = {
			uResource: { texture: 'camera', buffer: 'data', access: 'sampled' }
		};
		expect(
			() =>
				new ComputePass({
					compute: validCompute,
					resources: ambiguous as unknown as ComputeResourceMap
				})
		).toThrow(/exactly one of texture, buffer, or sampler/);

		const extraField = {
			uResource: { texture: 'camera', access: 'sampled', surprise: true }
		};
		expect(
			() =>
				new ComputePass({
					compute: validCompute,
					resources: extraField as unknown as ComputeResourceMap
				})
		).toThrow(/unsupported field "surprise"/);
	});

	it('validates descriptor access, versions, views, and external metadata', () => {
		const cases: Array<[ComputeResourceMap, RegExp]> = [
			[
				{
					uTexture: { texture: 'camera', access: 'storage-read' }
				} as unknown as ComputeResourceMap,
				/texture access/
			],
			[
				{
					uTexture: { texture: 'camera', access: 'storage-write', version: 'initial' }
				} as unknown as ComputeResourceMap,
				/cannot set version/
			],
			[
				{
					uTexture: { texture: 'camera', access: 'sampled', view: { mipLevelCount: 0 } }
				} as unknown as ComputeResourceMap,
				/positive integer/
			],
			[
				{
					uTexture: {
						texture: {
							externalTexture: {} as GPUTexture,
							resourceId: '',
							format: 'rgba8unorm',
							usage: 1 as GPUTextureUsageFlags
						},
						access: 'sampled'
					}
				},
				/resourceId/
			]
		];
		for (const [resources, expected] of cases) {
			expect(() => new ComputePass({ compute: validCompute, resources })).toThrow(expected);
		}
	});

	it('preserves static handles and provider functions while copying wrappers', () => {
		const texture = {} as GPUTexture;
		const provider = vi.fn(() => texture);
		const pass = new ComputePass({
			compute: validCompute,
			resources: {
				uStatic: {
					texture: {
						externalTexture: texture,
						resourceId: 'static',
						format: 'rgba8unorm',
						usage: 1 as GPUTextureUsageFlags
					},
					access: 'sampled'
				},
				uDynamic: {
					texture: {
						externalTexture: provider,
						resourceId: 'dynamic',
						format: 'rgba8unorm',
						usage: 1 as GPUTextureUsageFlags
					},
					access: 'sampled'
				}
			}
		});
		const staticDescriptor = pass.getResources().uStatic;
		const dynamicDescriptor = pass.getResources().uDynamic;
		if (
			!staticDescriptor ||
			!dynamicDescriptor ||
			!('texture' in staticDescriptor) ||
			!('texture' in dynamicDescriptor) ||
			typeof staticDescriptor.texture === 'string' ||
			typeof dynamicDescriptor.texture === 'string' ||
			!('externalTexture' in staticDescriptor.texture) ||
			!('externalTexture' in dynamicDescriptor.texture)
		) {
			throw new Error('Expected external texture descriptors.');
		}
		expect(staticDescriptor.texture.externalTexture).toBe(texture);
		expect(dynamicDescriptor.texture.externalTexture).toBe(provider);
	});

	it('rejects invalid compute shader contract', () => {
		expect(() => new ComputePass({ compute: 'fn broken() {}' })).toThrow(/@compute/);
	});

	it('extracts workgroup size from WGSL', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.getWorkgroupSize()).toEqual([256, 1, 1]);

		const pass2D = new ComputePass({ compute: validCompute2D });
		expect(pass2D.getWorkgroupSize()).toEqual([16, 16, 1]);
	});

	it('uses an explicit workgroup size for WGSL overrides', () => {
		const compute = `
override TILE_SIZE: u32 = 8;
@workgroup_size(TILE_SIZE, TILE_SIZE) @compute
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		const pass = new ComputePass({ compute, workgroupSize: [8, 8] });
		expect(pass.getWorkgroupSize()).toEqual([8, 8, 1]);
		expect(
			pass.resolveDispatch({
				width: 65,
				height: 33,
				time: 0,
				delta: 0.016,
				workgroupSize: pass.getWorkgroupSize()
			})
		).toEqual([9, 5, 1]);
	});

	it('defaults to enabled: true', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.enabled).toBe(true);
	});

	it('supports enabled: false', () => {
		const pass = new ComputePass({ compute: validCompute, enabled: false });
		expect(pass.enabled).toBe(false);
	});

	it('resolves static dispatch [64, 1, 1]', () => {
		const pass = new ComputePass({ compute: validCompute, dispatch: [64] });
		const dispatch = pass.resolveDispatch({
			width: 1920,
			height: 1080,
			time: 0,
			delta: 0.016,
			workgroupSize: [256, 1, 1]
		});
		expect(dispatch).toEqual([64, 1, 1]);
	});

	it('resolves auto dispatch from canvas size', () => {
		const pass = new ComputePass({ compute: validCompute, dispatch: 'auto' });
		const dispatch = pass.resolveDispatch({
			width: 1920,
			height: 1080,
			time: 0,
			delta: 0.016,
			workgroupSize: [256, 1, 1]
		});
		expect(dispatch).toEqual([Math.ceil(1920 / 256), Math.ceil(1080 / 1), 1]);
	});

	it('resolves dynamic dispatch via callback', () => {
		const pass = new ComputePass({
			compute: validCompute,
			dispatch: (ctx) => [ctx.width, ctx.height, 1]
		});
		const dispatch = pass.resolveDispatch({
			width: 320,
			height: 240,
			time: 0,
			delta: 0.016,
			workgroupSize: [256, 1, 1]
		});
		expect(dispatch).toEqual([320, 240, 1]);
	});

	it('auto dispatch: ceil(1920/16)=120, ceil(1080/16)=68', () => {
		const pass = new ComputePass({ compute: validCompute2D, dispatch: 'auto' });
		const dispatch = pass.resolveDispatch({
			width: 1920,
			height: 1080,
			time: 0,
			delta: 0.016,
			workgroupSize: [16, 16, 1]
		});
		expect(dispatch).toEqual([120, 68, 1]);
	});

	it('setCompute validates new shader and updates workgroup size', () => {
		const resources: ComputeResourceMap = {
			uCamera: { texture: 'camera', access: 'sampled' }
		};
		const pass = new ComputePass({ compute: validCompute, resources });
		expect(pass.getWorkgroupSize()).toEqual([256, 1, 1]);

		pass.setCompute(validCompute2D);
		expect(pass.getWorkgroupSize()).toEqual([16, 16, 1]);
		expect(pass.getCompute()).toBe(validCompute2D);
		expect(pass.getResources()).toEqual(resources);
	});

	it('setCompute rejects invalid new shader', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(() => pass.setCompute('fn bad() {}')).toThrow(/@compute/);
		// Ensure original state is preserved
		expect(pass.getCompute()).toBe(validCompute);
	});

	it('setCompute accepts an explicit size and updates atomically', () => {
		const pass = new ComputePass({ compute: validCompute });
		const overrideSource = `
override SIZE: u32 = 4;
@compute @workgroup_size(SIZE)
fn compute(@builtin(global_invocation_id) id: vec3u) {}
`;
		pass.setCompute(overrideSource, { workgroupSize: [4] });
		expect(pass.getCompute()).toBe(overrideSource);
		expect(pass.getWorkgroupSize()).toEqual([4, 1, 1]);
		expect(() => pass.setCompute(overrideSource)).toThrow(/explicit workgroupSize/i);
		expect(pass.getWorkgroupSize()).toEqual([4, 1, 1]);
	});

	it('setDispatch updates dispatch strategy', () => {
		const resources: ComputeResourceMap = {
			uCamera: { texture: 'camera', access: 'sampled' }
		};
		const pass = new ComputePass({ compute: validCompute, resources });
		pass.setDispatch([42]);
		const dispatch = pass.resolveDispatch({
			width: 100,
			height: 100,
			time: 0,
			delta: 0.016,
			workgroupSize: [256, 1, 1]
		});
		expect(dispatch).toEqual([42, 1, 1]);
		expect(pass.getResources()).toEqual(resources);
	});

	it('getCompute returns current shader source', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.getCompute()).toBe(validCompute);
	});

	it('dispose is idempotent', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(() => pass.dispose()).not.toThrow();
		expect(() => pass.dispose()).not.toThrow();
	});

	it('isCompute is true', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.isCompute).toBe(true);
	});
});
