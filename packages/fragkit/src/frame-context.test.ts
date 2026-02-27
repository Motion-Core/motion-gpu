import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createFrameRegistry } from './lib/frame-context';

function createState(registry: ReturnType<typeof createFrameRegistry>, delta = 0.016) {
	return {
		time: 1,
		delta,
		setUniform: vi.fn(),
		setTexture: vi.fn(),
		invalidate: registry.invalidate,
		advance: registry.advance,
		renderMode: registry.getRenderMode(),
		autoRender: registry.getAutoRender(),
		canvas: document.createElement('canvas')
	};
}

describe('frame registry', () => {
	it('runs registered callbacks', () => {
		const registry = createFrameRegistry();
		const callback = vi.fn();
		registry.register(callback);

		registry.run(createState(registry));

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({
				time: 1,
				delta: 0.016
			})
		);
	});

	it('stops calling unsubscribed callbacks', () => {
		const registry = createFrameRegistry();
		const callback = vi.fn();
		const registration = registry.register(callback);
		registration.unsubscribe();

		registry.run(createState(registry));

		expect(callback).not.toHaveBeenCalled();
	});

	it('supports on-demand invalidation flow', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });

		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);

		registry.invalidate();
		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
	});

	it('supports manual advance flow', () => {
		const registry = createFrameRegistry({ renderMode: 'manual' });

		expect(registry.shouldRender()).toBe(false);
		registry.advance();
		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
	});

	it('clamps delta passed to callbacks and supports runtime updates', () => {
		const registry = createFrameRegistry({ maxDelta: 0.05 });
		const callback = vi.fn();
		registry.register(callback);

		registry.run(createState(registry, 0.2));
		expect(callback).toHaveBeenCalledWith(expect.objectContaining({ delta: 0.05 }));

		registry.setMaxDelta(0.01);
		registry.run(createState(registry, 0.2));
		expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ delta: 0.01 }));
	});

	it('can disable auto-render', () => {
		const registry = createFrameRegistry({ renderMode: 'always', autoRender: false });
		expect(registry.shouldRender()).toBe(false);
	});

	it('orders tasks using before/after dependencies', () => {
		const registry = createFrameRegistry();
		const execution: string[] = [];

		registry.register('a', () => execution.push('a'));
		registry.register('c', () => execution.push('c'), { after: 'a' });
		registry.register('b', () => execution.push('b'), { after: 'a', before: 'c' });

		registry.run(createState(registry));

		expect(execution).toEqual(['a', 'b', 'c']);
	});

	it('runs stage graph respecting stage dependencies', () => {
		const registry = createFrameRegistry();
		const execution: string[] = [];

		registry.createStage('early');
		registry.createStage('late', { after: 'early' });

		registry.register('late-task', () => execution.push('late'), { stage: 'late' });
		registry.register('early-task', () => execution.push('early'), { stage: 'early' });

		registry.run(createState(registry));

		expect(execution).toEqual(['early', 'late']);
	});

	it('supports running gate and start/stop controls', () => {
		const registry = createFrameRegistry();
		let gate = true;
		const callback = vi.fn();

		const registration = registry.register('gated', callback, {
			running: () => gate,
			autoStart: true
		});

		expect(get(registration.started)).toBe(true);
		registry.run(createState(registry));
		expect(callback).toHaveBeenCalledTimes(1);

		gate = false;
		registry.run(createState(registry));
		expect(callback).toHaveBeenCalledTimes(1);
		expect(get(registration.started)).toBe(false);

		gate = true;
		registration.stop();
		registry.run(createState(registry));
		expect(callback).toHaveBeenCalledTimes(1);

		registration.start();
		registry.run(createState(registry));
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it('auto-invalidates on-demand mode when active tasks run', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);

		registry.register(() => undefined, { autoInvalidate: true });
		registry.run(createState(registry));

		expect(registry.shouldRender()).toBe(true);
	});

	it('provides schedule snapshot and optional frame timings diagnostics', () => {
		const registry = createFrameRegistry({ diagnosticsEnabled: true });

		registry.createStage('early');
		registry.createStage('late', { after: 'early' });
		registry.register('early-task', () => undefined, { stage: 'early' });
		registry.register('late-task', () => undefined, { stage: 'late', after: 'early-task' });

		const schedule = registry.getSchedule();
		expect(schedule.stages.some((stage) => stage.key === 'early')).toBe(true);
		expect(schedule.stages.some((stage) => stage.key === 'late')).toBe(true);
		expect(schedule.stages.find((stage) => stage.key === 'early')?.tasks).toContain('early-task');

		registry.run(createState(registry));
		const timings = registry.getLastRunTimings();
		expect(timings).not.toBeNull();
		expect(timings?.total).toBeGreaterThanOrEqual(0);
		expect(timings?.stages.early?.duration).toBeGreaterThanOrEqual(0);
		expect(timings?.stages.early?.tasks['early-task']).toBeGreaterThanOrEqual(0);

		registry.setDiagnosticsEnabled(false);
		expect(registry.getDiagnosticsEnabled()).toBe(false);
		expect(registry.getLastRunTimings()).toBeNull();
	});
});
