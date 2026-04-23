import { describe, expect, it } from 'vitest';
import { PingPongComputePass } from '../../lib/passes/PingPongComputePass';

const validCompute = `
@compute @workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
}
`;

describe('PingPongComputePass', () => {
	it('creates with valid compute and target', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'simulation'
		});
		expect(pass.enabled).toBe(true);
		expect(pass.isCompute).toBe(true);
		expect(pass.isPingPong).toBe(true);
		expect(pass.getTarget()).toBe('simulation');
	});

	it('rejects invalid compute shader', () => {
		expect(
			() =>
				new PingPongComputePass({
					compute: 'fn bad() {}',
					target: 'sim'
				})
		).toThrow(/@compute/);
	});

	it('defaults iterations to 1', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(pass.getIterations()).toBe(1);
	});

	it('setIterations validates >= 1', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		pass.setIterations(5);
		expect(pass.getIterations()).toBe(5);
	});

	it('setIterations rejects 0', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(() => pass.setIterations(0)).toThrow(/positive integer >= 1/);
	});

	it('setIterations rejects negative', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(() => pass.setIterations(-1)).toThrow(/positive integer >= 1/);
	});

	it('setIterations rejects non-integer', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(() => pass.setIterations(1.5)).toThrow(/positive integer >= 1/);
	});

	it('getCurrentOutput alternates after odd/even iterations', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			iterations: 1
		});

		// Frame 0: 0 total iterations → even → A
		expect(pass.getCurrentOutput()).toBe('simA');

		pass.advanceFrame();
		// Frame 1: 1 total iteration → odd → B
		expect(pass.getCurrentOutput()).toBe('simB');

		pass.advanceFrame();
		// Frame 2: 2 total iterations → even → A
		expect(pass.getCurrentOutput()).toBe('simA');
	});

	it('getCurrentOutput with multiple iterations per frame', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'buf',
			iterations: 3
		});

		// Frame 0: 0 total → A
		expect(pass.getCurrentOutput()).toBe('bufA');

		pass.advanceFrame();
		// Frame 1: 3 total → odd → B
		expect(pass.getCurrentOutput()).toBe('bufB');

		pass.advanceFrame();
		// Frame 2: 6 total → even → A
		expect(pass.getCurrentOutput()).toBe('bufA');
	});

	it('getTarget returns declared target key', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'particles'
		});
		expect(pass.getTarget()).toBe('particles');
	});

	it('setCompute validates new shader', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(() => pass.setCompute('fn bad() {}')).toThrow(/@compute/);
	});

	it('resolveDispatch supports auto dispatch', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			dispatch: 'auto'
		});
		const dispatch = pass.resolveDispatch({
			width: 1024,
			height: 512,
			time: 0,
			delta: 0.016,
			workgroupSize: [16, 16, 1]
		});
		expect(dispatch).toEqual([Math.ceil(1024 / 16), Math.ceil(512 / 16), 1]);
	});

	it('resolveDispatch supports dynamic callback dispatch', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			dispatch: (ctx) => [ctx.width / 2, ctx.height / 2, 3]
		});
		const dispatch = pass.resolveDispatch({
			width: 64,
			height: 32,
			time: 1,
			delta: 0.1,
			workgroupSize: [16, 16, 1]
		});
		expect(dispatch).toEqual([32, 16, 3]);
	});

	it('resolveDispatch supports tuple dispatch with defaults', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			dispatch: [7]
		});
		const dispatch = pass.resolveDispatch({
			width: 320,
			height: 240,
			time: 0,
			delta: 0.016,
			workgroupSize: [16, 16, 1]
		});
		expect(dispatch).toEqual([7, 1, 1]);
	});

	it('resolveDispatch falls back to [1, 1, 1] for unexpected dispatch mode', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		pass.setDispatch('unexpected' as unknown as Parameters<typeof pass.setDispatch>[0]);
		const dispatch = pass.resolveDispatch({
			width: 100,
			height: 100,
			time: 0,
			delta: 0.016,
			workgroupSize: [16, 16, 1]
		});
		expect(dispatch).toEqual([1, 1, 1]);
	});

	it('preserves output parity when iterations change mid-run', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			iterations: 3
		});

		expect(pass.getCurrentOutput()).toBe('simA');
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('simB');

		pass.setIterations(2);
		expect(pass.getCurrentOutput()).toBe('simB');
	});

	it('tracks total iterations across iteration-count changes', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			iterations: 1
		});

		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('simB');

		pass.setIterations(2);
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('simB');

		pass.setIterations(3);
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('simA');
	});

	it('keeps output on A for even iteration counts across frames', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim',
			iterations: 2
		});

		expect(pass.getCurrentOutput()).toBe('simA');
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('simA');
		pass.advanceFrame();
		expect(pass.getCurrentOutput()).toBe('simA');
	});

	it('isCompute is true', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(pass.isCompute).toBe(true);
	});

	it('isPingPong is true', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(pass.isPingPong).toBe(true);
	});

	it('dispose is idempotent', () => {
		const pass = new PingPongComputePass({
			compute: validCompute,
			target: 'sim'
		});
		expect(() => pass.dispose()).not.toThrow();
		expect(() => pass.dispose()).not.toThrow();
	});
});
