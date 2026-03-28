import { describe, expect, it } from 'vitest';
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
	it('creates with valid compute shader', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.enabled).toBe(true);
		expect(pass.isCompute).toBe(true);
		expect(pass.getCompute()).toBe(validCompute);
	});

	it('rejects invalid compute shader contract', () => {
		expect(
			() => new ComputePass({ compute: 'fn broken() {}' })
		).toThrow(/@compute/);
	});

	it('extracts workgroup size from WGSL', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.getWorkgroupSize()).toEqual([256, 1, 1]);

		const pass2D = new ComputePass({ compute: validCompute2D });
		expect(pass2D.getWorkgroupSize()).toEqual([16, 16, 1]);
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
		const pass = new ComputePass({ compute: validCompute });
		expect(pass.getWorkgroupSize()).toEqual([256, 1, 1]);

		pass.setCompute(validCompute2D);
		expect(pass.getWorkgroupSize()).toEqual([16, 16, 1]);
		expect(pass.getCompute()).toBe(validCompute2D);
	});

	it('setCompute rejects invalid new shader', () => {
		const pass = new ComputePass({ compute: validCompute });
		expect(() => pass.setCompute('fn bad() {}')).toThrow(/@compute/);
		// Ensure original state is preserved
		expect(pass.getCompute()).toBe(validCompute);
	});

	it('setDispatch updates dispatch strategy', () => {
		const pass = new ComputePass({ compute: validCompute });
		pass.setDispatch([42]);
		const dispatch = pass.resolveDispatch({
			width: 100,
			height: 100,
			time: 0,
			delta: 0.016,
			workgroupSize: [256, 1, 1]
		});
		expect(dispatch).toEqual([42, 1, 1]);
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
