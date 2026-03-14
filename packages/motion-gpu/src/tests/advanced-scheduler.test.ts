import { describe, expect, it, vi } from 'vitest';
import { applySchedulerPreset, captureSchedulerDebugSnapshot } from '../lib/core/scheduler-helpers';
import { createFrameRegistry } from '../lib/core/frame-registry';

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

describe('advanced scheduler helpers', () => {
	it('applies named presets to scheduler timing controls', () => {
		const registry = createFrameRegistry();

		const debug = applySchedulerPreset(registry, 'debug');
		expect(debug).toEqual({
			diagnosticsEnabled: true,
			profilingEnabled: true,
			profilingWindow: 240
		});
		expect(registry.getDiagnosticsEnabled()).toBe(true);
		expect(registry.getProfilingEnabled()).toBe(true);
		expect(registry.getProfilingWindow()).toBe(240);

		const performance = applySchedulerPreset(registry, 'performance');
		expect(performance).toEqual({
			diagnosticsEnabled: false,
			profilingEnabled: false,
			profilingWindow: 60
		});
		expect(registry.getDiagnosticsEnabled()).toBe(false);
		expect(registry.getProfilingEnabled()).toBe(false);
		expect(registry.getProfilingSnapshot()).toBeNull();
		expect(registry.getLastRunTimings()).toBeNull();
	});

	it('supports preset overrides', () => {
		const registry = createFrameRegistry();

		const config = applySchedulerPreset(registry, 'balanced', {
			profilingWindow: 96.7
		});

		expect(config).toEqual({
			diagnosticsEnabled: true,
			profilingEnabled: true,
			profilingWindow: 96
		});
		expect(registry.getProfilingWindow()).toBe(96);
	});

	it('throws when diagnostics and profiling overrides diverge', () => {
		const registry = createFrameRegistry();

		expect(() =>
			applySchedulerPreset(registry, 'debug', {
				diagnosticsEnabled: false,
				profilingEnabled: true
			})
		).toThrow(/must match/);
		expect(registry.getDiagnosticsEnabled()).toBe(false);
		expect(registry.getProfilingEnabled()).toBe(false);
	});

	it('captures scheduler debug snapshot', () => {
		const registry = createFrameRegistry();
		registry.createStage('post');
		registry.register('post-task', () => undefined, { stage: 'post' });
		applySchedulerPreset(registry, 'debug', { profilingWindow: 8 });

		registry.run(createState(registry));
		const snapshot = captureSchedulerDebugSnapshot(registry);

		expect(snapshot.diagnosticsEnabled).toBe(true);
		expect(snapshot.profilingEnabled).toBe(true);
		expect(snapshot.profilingWindow).toBe(8);
		expect(snapshot.schedule.stages.some((stage) => stage.key === 'post')).toBe(true);
		expect(snapshot.lastRunTimings).not.toBeNull();
		expect(snapshot.lastRunTimings?.stages.post?.tasks['post-task']).toBeGreaterThanOrEqual(0);
		expect(snapshot.profilingSnapshot?.frameCount).toBe(1);
	});
});
