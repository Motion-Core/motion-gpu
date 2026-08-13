import { describe, expect, it, vi } from 'vitest';
import type { ComputeResourceMap } from '../../lib/core/types';
import { PingPongComputePass } from '../../lib/passes/PingPongComputePass';

const validCompute = `
@compute @workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
}
`;

const validCompute1D = `
@compute @workgroup_size(64)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
}
`;

function createResources(texture = 'simulation'): ComputeResourceMap {
	return {
		uPrevious: { texture, access: 'sampled', pingPong: 'read' },
		uNext: { texture, access: 'storage-write', pingPong: 'write' }
	};
}

function createPass(
	options: Partial<ConstructorParameters<typeof PingPongComputePass>[0]> = {}
): PingPongComputePass {
	return new PingPongComputePass({
		compute: validCompute,
		resources: createResources(),
		...options
	});
}

describe('PingPongComputePass', () => {
	it('creates with one explicit read/write resource pair', () => {
		const pass = createPass();
		expect(pass.enabled).toBe(true);
		expect(pass.isCompute).toBe(true);
		expect(pass.isPingPong).toBe(true);
		expect(pass.getResources()).toEqual(createResources());
		expect('getTarget' in pass).toBe(false);
		expect('getCurrentOutput' in pass).toBe(false);
	});

	it('rejects an invalid compute shader before storing state', () => {
		expect(() => createPass({ compute: 'fn bad() {}' })).toThrow(/@compute/);
	});

	it('requires exactly one ping-pong read and write descriptor', () => {
		for (const resources of [
			{},
			{ uPrevious: { texture: 'simulation', access: 'sampled', pingPong: 'read' } },
			{
				uPrevious: { texture: 'simulation', access: 'sampled', pingPong: 'read' },
				uPreviousAgain: { texture: 'simulation', access: 'sampled', pingPong: 'read' },
				uNext: { texture: 'simulation', access: 'storage-write', pingPong: 'write' }
			}
		] as const) {
			expect(() => createPass({ resources: resources as ComputeResourceMap })).toThrow(
				/exactly one pingPong read texture and one pingPong write texture/
			);
		}
	});

	it('requires the read and write roles to use sampled and storage-write access', () => {
		const invalidRead = {
			uPrevious: {
				texture: 'simulation',
				access: 'storage-write',
				pingPong: 'read'
			},
			uNext: { texture: 'simulation', access: 'storage-write', pingPong: 'write' }
		};
		expect(() => createPass({ resources: invalidRead as unknown as ComputeResourceMap })).toThrow(
			/storage-write pingPong role must be "write"/
		);
	});

	it('requires both roles to reference the same material texture', () => {
		expect(() =>
			createPass({
				resources: {
					uPrevious: { texture: 'simulationA', access: 'sampled', pingPong: 'read' },
					uNext: { texture: 'simulationB', access: 'storage-write', pingPong: 'write' }
				}
			})
		).toThrow(/must reference the same texture/);
	});

	it('compares external ping-pong identity by resourceId', () => {
		const textureA = {} as GPUTexture;
		const textureB = {} as GPUTexture;
		const sharedId = Symbol('simulation');
		const pass = createPass({
			resources: {
				uPrevious: {
					texture: {
						externalTexture: textureA,
						resourceId: sharedId,
						format: 'rgba16float',
						usage: 3 as GPUTextureUsageFlags
					},
					access: 'sampled',
					pingPong: 'read'
				},
				uNext: {
					texture: {
						externalTexture: textureB,
						resourceId: sharedId,
						format: 'rgba16float',
						usage: 3 as GPUTextureUsageFlags
					},
					access: 'storage-write',
					pingPong: 'write'
				}
			}
		});
		expect(pass.getResources().uPrevious).toMatchObject({ access: 'sampled' });

		expect(() =>
			createPass({
				resources: {
					uPrevious: {
						texture: {
							externalTexture: textureA,
							resourceId: 'one',
							format: 'rgba16float',
							usage: 1 as GPUTextureUsageFlags
						},
						access: 'sampled',
						pingPong: 'read'
					},
					uNext: {
						texture: {
							externalTexture: textureB,
							resourceId: 'two',
							format: 'rgba16float',
							usage: 2 as GPUTextureUsageFlags
						},
						access: 'storage-write',
						pingPong: 'write'
					}
				}
			})
		).toThrow(/must reference the same texture/);
	});

	it('allows unrelated resources alongside the pair and sorts every alias', () => {
		const pass = createPass({
			resources: {
				zSampler: { sampler: 'camera' },
				uNext: { texture: 'simulation', access: 'storage-write', pingPong: 'write' },
				aObstacle: { texture: 'obstacle', access: 'sampled' },
				uPrevious: { texture: 'simulation', access: 'sampled', pingPong: 'read' }
			}
		});
		expect(Object.keys(pass.getResources())).toEqual([
			'aObstacle',
			'uNext',
			'uPrevious',
			'zSampler'
		]);
	});

	it('captures an immutable topology and returns defensive copies', () => {
		const resources: Record<string, ComputeResourceMap[string]> = {
			uPrevious: { texture: 'simulation', access: 'sampled', pingPong: 'read' },
			uNext: { texture: 'simulation', access: 'storage-write', pingPong: 'write' }
		};
		const pass = createPass({ resources });
		resources.uExtra = { sampler: 'camera' };
		delete resources.uPrevious;

		const first = pass.getResources() as Record<string, ComputeResourceMap[string]>;
		first.uExtra = { sampler: 'camera' };
		delete first.uPrevious;

		expect(pass.getResources()).toEqual(createResources());
	});

	it('preserves external provider identity while copying descriptors', () => {
		const provider = vi.fn(() => ({}) as GPUTexture);
		const resources: ComputeResourceMap = {
			uPrevious: {
				texture: {
					externalTexture: provider,
					resourceId: 'simulation',
					format: 'rgba16float',
					usage: 3 as GPUTextureUsageFlags
				},
				access: 'sampled',
				pingPong: 'read'
			},
			uNext: {
				texture: {
					externalTexture: provider,
					resourceId: 'simulation',
					format: 'rgba16float',
					usage: 3 as GPUTextureUsageFlags
				},
				access: 'storage-write',
				pingPong: 'write'
			}
		};
		const pass = createPass({ resources });
		const previous = pass.getResources().uPrevious;
		expect(previous && 'texture' in previous && typeof previous.texture !== 'string').toBeTruthy();
		if (previous && 'texture' in previous && typeof previous.texture !== 'string') {
			expect('externalTexture' in previous.texture && previous.texture.externalTexture).toBe(
				provider
			);
		}
	});

	it('defaults iterations to one and validates updates', () => {
		const pass = createPass();
		expect(pass.getIterations()).toBe(1);
		pass.setIterations(5);
		expect(pass.getIterations()).toBe(5);
		for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => pass.setIterations(count)).toThrow(/positive integer >= 1/);
		}
		expect(pass.getIterations()).toBe(5);
	});

	it('rejects invalid constructor iterations', () => {
		expect(() => createPass({ iterations: 0 })).toThrow(/positive integer >= 1/);
	});

	it('setCompute updates shader state atomically without changing resources', () => {
		const pass = createPass();
		const resources = pass.getResources();
		expect(() => pass.setCompute('fn bad() {}')).toThrow(/@compute/);
		expect(pass.getCompute()).toBe(validCompute);
		pass.setCompute(validCompute1D);
		expect(pass.getCompute()).toBe(validCompute1D);
		expect(pass.getWorkgroupSize()).toEqual([64, 1, 1]);
		expect(pass.getResources()).toEqual(resources);
	});

	it('supports auto, tuple, and callback dispatch without changing resources', () => {
		const pass = createPass({ dispatch: 'auto' });
		const context = {
			width: 1024,
			height: 512,
			time: 0,
			delta: 0.016,
			workgroupSize: [16, 16, 1] as [number, number, number]
		};
		expect(pass.resolveDispatch(context)).toEqual([64, 32, 1]);
		pass.setDispatch([7]);
		expect(pass.resolveDispatch(context)).toEqual([7, 1, 1]);
		pass.setDispatch((ctx) => [ctx.width / 2, ctx.height / 2, 3]);
		expect(pass.resolveDispatch(context)).toEqual([512, 256, 3]);
		expect(pass.getResources()).toEqual(createResources());
	});

	it('dispose is idempotent', () => {
		const pass = createPass();
		expect(() => pass.dispose()).not.toThrow();
		expect(() => pass.dispose()).not.toThrow();
	});
});
