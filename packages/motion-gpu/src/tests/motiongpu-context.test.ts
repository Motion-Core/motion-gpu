import { render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionGPUContext } from '../lib/motiongpu-context';
import MotionGPUOutside from './fixtures/MotionGPUOutside.svelte';
import MotionGPUWithProbe from './fixtures/MotionGPUWithProbe.svelte';

describe('useMotionGPU', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('throws when used outside <FragCanvas>', () => {
		expect(() => render(MotionGPUOutside)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('provides runtime context inside <FragCanvas>', async () => {
		const onProbe = vi.fn();
		render(MotionGPUWithProbe, { props: { onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const context = onProbe.mock.calls[0]?.[0] as MotionGPUContext;
		expect(context.canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(context.size.current.width).toBeGreaterThanOrEqual(0);
		expect(context.size.current.height).toBeGreaterThanOrEqual(0);

		expect(context.renderMode.current).toBe('always');
		context.renderMode.set('manual');
		expect(context.renderMode.current).toBe('manual');

		expect(context.autoRender.current).toBe(true);
		context.autoRender.set(false);
		expect(context.autoRender.current).toBe(false);

		expect(context.maxDelta.current).toBe(0.1);
		context.maxDelta.set(0.05);
		expect(context.maxDelta.current).toBe(0.05);

		expect(context.user.current).toEqual({});
		context.user.set({ plugin: { enabled: true } });
		expect(context.user.current).toEqual({ plugin: { enabled: true } });

		const createdStage = context.scheduler.createStage('post');
		expect(createdStage.key).toBe('post');
		expect(context.scheduler.getStage('post')?.key).toBe('post');

		context.scheduler.setDiagnosticsEnabled(true);
		expect(context.scheduler.getDiagnosticsEnabled()).toBe(true);
		expect(context.scheduler.getSchedule().stages.length).toBeGreaterThan(0);
		context.scheduler.setProfilingEnabled(true);
		expect(context.scheduler.getProfilingEnabled()).toBe(true);
		context.scheduler.setProfilingWindow(4);
		expect(context.scheduler.getProfilingWindow()).toBe(4);
		expect(context.scheduler.getProfilingSnapshot()).not.toBeNull();
		context.scheduler.resetProfiling();
	});
});
