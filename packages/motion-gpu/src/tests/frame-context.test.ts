import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createFrameRegistry } from '../lib/core/frame-registry';

function createState(registry: ReturnType<typeof createFrameRegistry>, delta = 0.016) {
	return {
		time: 1,
		delta,
		setUniform: vi.fn(),
		setTexture: vi.fn(),
		writeStorageBuffer: vi.fn(),
		readStorageBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
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

	it('clear() removes all registered callbacks from every stage', () => {
		const registry = createFrameRegistry();
		const callbackA = vi.fn();
		const callbackB = vi.fn();
		registry.createStage('post');
		registry.register('a', callbackA);
		registry.register('b', callbackB, { stage: 'post' });

		registry.run(createState(registry));
		expect(callbackA).toHaveBeenCalledTimes(1);
		expect(callbackB).toHaveBeenCalledTimes(1);

		registry.clear();
		registry.run(createState(registry));
		expect(callbackA).toHaveBeenCalledTimes(1);
		expect(callbackB).toHaveBeenCalledTimes(1);
	});

	it('does not let stale unsubscribe from replaced task key remove newer registration', () => {
		const registry = createFrameRegistry();
		const firstCallback = vi.fn();
		const secondCallback = vi.fn();

		const first = registry.register('shared', firstCallback);
		registry.run(createState(registry));
		expect(firstCallback).toHaveBeenCalledTimes(1);
		expect(secondCallback).toHaveBeenCalledTimes(0);

		registry.register('shared', secondCallback);
		registry.run(createState(registry));
		expect(firstCallback).toHaveBeenCalledTimes(1);
		expect(secondCallback).toHaveBeenCalledTimes(1);

		first.unsubscribe();
		registry.run(createState(registry));
		expect(secondCallback).toHaveBeenCalledTimes(2);
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
		const registry = createFrameRegistry({
			renderMode: 'always',
			autoRender: false
		});
		expect(registry.shouldRender()).toBe(false);
	});

	it('orders tasks using before/after dependencies', () => {
		const registry = createFrameRegistry();
		const execution: string[] = [];

		registry.register('a', () => execution.push('a'));
		registry.register('c', () => execution.push('c'), { after: 'a' });
		registry.register('b', () => execution.push('b'), {
			after: 'a',
			before: 'c'
		});

		registry.run(createState(registry));

		expect(execution).toEqual(['a', 'b', 'c']);
	});

	it('runs stage graph respecting stage dependencies', () => {
		const registry = createFrameRegistry();
		const execution: string[] = [];

		registry.createStage('early');
		registry.createStage('late', { after: 'early' });

		registry.register('late-task', () => execution.push('late'), {
			stage: 'late'
		});
		registry.register('early-task', () => execution.push('early'), {
			stage: 'early'
		});

		registry.run(createState(registry));

		expect(execution).toEqual(['early', 'late']);
	});

	it('updates existing stage dependencies and callback when createStage is called again', () => {
		const registry = createFrameRegistry();
		const execution: string[] = [];

		registry.createStage('early');
		registry.createStage('late');
		registry.register('early-task', () => execution.push('early'), {
			stage: 'early'
		});
		registry.register('late-task', () => execution.push('late'), {
			stage: 'late'
		});

		registry.run(createState(registry));
		expect(execution).toEqual(['early', 'late']);

		execution.length = 0;
		const updatedCallback = vi.fn((_state, runTasks: () => void) => runTasks());
		registry.createStage('early', { after: 'late', callback: updatedCallback });

		registry.run(createState(registry));
		expect(updatedCallback).toHaveBeenCalledTimes(1);
		expect(execution).toEqual(['late', 'early']);
	});

	it('clears stage dependencies and can reset stage callback to default', () => {
		const registry = createFrameRegistry();
		const execution: string[] = [];
		const skipStageCallback = vi.fn(() => undefined);

		registry.createStage('a', { callback: skipStageCallback });
		registry.createStage('b');
		registry.register('a-task', () => execution.push('a'), { stage: 'a' });
		registry.register('b-task', () => execution.push('b'), { stage: 'b' });

		registry.createStage('a', { after: 'b' });
		registry.run(createState(registry));
		expect(execution).toEqual(['b']);

		execution.length = 0;
		registry.createStage('a', { after: [], callback: null });
		registry.run(createState(registry));
		expect(execution).toEqual(['a', 'b']);
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

	it('supports tokenized invalidation and clears tokens at frame end', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);

		registry.invalidate('camera');
		registry.invalidate('camera');
		expect(registry.shouldRender()).toBe(true);

		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
	});

	it('supports per-task on-change invalidation tokens', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });
		let token = 1;
		registry.register('on-change', () => undefined, {
			invalidation: {
				mode: 'on-change',
				token: () => token
			}
		});

		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);

		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(true);

		registry.endFrame();
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(false);

		token = 2;
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(true);
	});

	it('applies explicit mode-switch rules for always, on-demand and manual', () => {
		const registry = createFrameRegistry({ renderMode: 'always' });

		registry.endFrame();
		registry.setRenderMode('on-demand');
		expect(registry.shouldRender()).toBe(true);

		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);

		registry.setRenderMode('manual');
		expect(registry.shouldRender()).toBe(false);
		registry.invalidate('manual-token');
		expect(registry.shouldRender()).toBe(false);

		registry.advance();
		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
	});

	it('provides schedule snapshot and optional frame timings diagnostics', () => {
		const registry = createFrameRegistry({ diagnosticsEnabled: true });

		registry.createStage('early');
		registry.createStage('late', { after: 'early' });
		registry.register('early-task', () => undefined, { stage: 'early' });
		registry.register('late-task', () => undefined, {
			stage: 'late',
			after: 'early-task'
		});

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

	it('provides profiling snapshot with rolling averages and reset controls', () => {
		const registry = createFrameRegistry({
			profilingEnabled: true,
			profilingWindow: 2
		});
		registry.createStage('profile');
		registry.register('profile-task', () => undefined, { stage: 'profile' });

		registry.run(createState(registry));
		registry.run(createState(registry));
		let snapshot = registry.getProfilingSnapshot();
		expect(snapshot).not.toBeNull();
		expect(snapshot?.frameCount).toBe(2);
		expect(snapshot?.window).toBe(2);
		expect(snapshot?.total.count).toBe(2);
		const profileStage = snapshot?.stages['profile'];
		expect(profileStage).toBeDefined();
		if (!profileStage) {
			return;
		}

		expect(profileStage.timings.count).toBe(2);
		expect(profileStage.tasks['profile-task']?.count).toBe(2);

		registry.run(createState(registry));
		snapshot = registry.getProfilingSnapshot();
		expect(snapshot?.frameCount).toBe(2);

		registry.setProfilingWindow(4);
		expect(registry.getProfilingWindow()).toBe(4);
		registry.resetProfiling();
		snapshot = registry.getProfilingSnapshot();
		expect(snapshot?.frameCount).toBe(0);

		registry.setProfilingEnabled(false);
		expect(registry.getProfilingSnapshot()).toBeNull();
		expect(registry.getProfilingEnabled()).toBe(false);
	});

	it('supports stage callback wrappers for conditional task execution', () => {
		const registry = createFrameRegistry();
		let runTasks = false;
		const stageCallback = vi.fn((_state, execute: () => void) => {
			if (runTasks) {
				execute();
			}
		});
		const callback = vi.fn();

		registry.createStage('conditional', { callback: stageCallback });
		registry.register('conditional-task', callback, { stage: 'conditional' });

		registry.run(createState(registry));
		expect(stageCallback).toHaveBeenCalledTimes(1);
		expect(callback).not.toHaveBeenCalled();

		runTasks = true;
		registry.run(createState(registry));
		expect(stageCallback).toHaveBeenCalledTimes(2);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('validates initial scheduler options', () => {
		expect(() => createFrameRegistry({ maxDelta: 0 })).toThrow(/maxDelta must be/);
		expect(() => createFrameRegistry({ profilingWindow: 0 })).toThrow(/profilingWindow must be/);
	});

	it('profilingHistory ring buffer: frameCount stays pinned at window and survives window resize', () => {
		const registry = createFrameRegistry({
			profilingEnabled: true,
			profilingWindow: 4
		});
		registry.register('noop', () => undefined);

		// Run fewer frames than window — frameCount tracks actual frames.
		for (let i = 0; i < 3; i++) registry.run(createState(registry));
		expect(registry.getProfilingSnapshot()?.frameCount).toBe(3);

		// Once window is saturated frameCount must not grow past it.
		for (let i = 0; i < 10; i++) registry.run(createState(registry));
		expect(registry.getProfilingSnapshot()?.frameCount).toBe(4);

		// Shrinking the window must drop oldest entries.
		registry.setProfilingWindow(2);
		expect(registry.getProfilingSnapshot()?.frameCount).toBe(2);
		expect(registry.getProfilingSnapshot()?.window).toBe(2);

		// Growing the window must not invent phantom frames.
		registry.setProfilingWindow(8);
		expect(registry.getProfilingSnapshot()?.frameCount).toBe(2);

		// Running more frames must fill the new (larger) window.
		for (let i = 0; i < 6; i++) registry.run(createState(registry));
		expect(registry.getProfilingSnapshot()?.frameCount).toBe(8);

		// Snapshot data integrity: total frame count matches window.
		const snapshot = registry.getProfilingSnapshot();
		expect(snapshot?.total.count).toBe(8);
	});

	it('rejects task registration without a callback', () => {
		const registry = createFrameRegistry();
		expect(() =>
			(registry.register as unknown as (key: string) => unknown)('missing-callback')
		).toThrow(/useFrame requires a callback/);
	});

	it('infers task stage from task dependencies when stage is omitted', () => {
		const registry = createFrameRegistry();
		registry.createStage('post');
		const base = registry.register('base', () => undefined, { stage: 'post' });
		const derived = registry.register('derived', () => undefined, { after: base.task });

		expect(derived.task.stage).toBe('post');
		const postStage = registry.getSchedule().stages.find((stage) => stage.key === 'post');
		expect(postStage?.tasks).toEqual(['base', 'derived']);
	});

	it('throws deterministic error for cyclic task dependencies', () => {
		const registry = createFrameRegistry();
		registry.register('a', () => undefined, { after: 'b' });
		registry.register('b', () => undefined, { after: 'a' });

		expect(() => registry.run(createState(registry))).toThrow(
			/Frame task graph for stage .* dependency cycle detected: a -> b -> a/
		);
	});

	it('throws deterministic error for cyclic stage dependencies', () => {
		const registry = createFrameRegistry();
		registry.createStage('a', { after: 'b' });
		registry.createStage('b', { after: 'a' });

		expect(() => registry.getSchedule()).toThrow(
			/Frame stage graph dependency cycle detected: a -> b -> a/
		);
	});

	it('throws for missing task dependencies', () => {
		const registry = createFrameRegistry();
		registry.register('a', () => undefined, { after: 'missing-task' });

		expect(() => registry.run(createState(registry))).toThrow(
			/Frame task graph for stage .* references missing dependency "missing-task" in "after"/
		);
	});

	it('throws for missing stage dependencies', () => {
		const registry = createFrameRegistry();
		registry.createStage('late', { after: 'missing-stage' });

		expect(() => registry.getSchedule()).toThrow(
			/Frame stage graph dependency error: stage "late" references missing dependency "missing-stage" in "after"/
		);
	});

	it('supports explicit never invalidation mode in on-demand rendering', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });
		registry.register(() => undefined, { invalidation: 'never' });

		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(false);
	});

	it('treats on-change invalidation token as fresh after token becomes null', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });
		let token: number | null = null;
		registry.register(() => undefined, {
			invalidation: {
				mode: 'on-change',
				token: () => token
			}
		});

		registry.endFrame();
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(false);

		token = 1;
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(true);

		registry.endFrame();
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(false);

		token = null;
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(false);

		token = 1;
		registry.run(createState(registry));
		expect(registry.shouldRender()).toBe(true);
	});
});
