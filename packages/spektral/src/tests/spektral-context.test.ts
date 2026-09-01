import { render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpektralContext } from '../lib/svelte/spektral-context';
import SpektralOutside from './fixtures/SpektralOutside.svelte';
import SpektralWithProbe from './fixtures/SpektralWithProbe.svelte';

describe('useSpektral', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('throws when used outside <FragCanvas>', () => {
		expect(() => render(SpektralOutside)).toThrow(/useSpektral must be used inside <FragCanvas>/);
	});

	it('provides runtime context inside <FragCanvas>', async () => {
		const onProbe = vi.fn();
		const view = render(SpektralWithProbe, { props: { onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const context = onProbe.mock.calls[0]?.[0] as SpektralContext;
		const graphSnapshot = context.graph.getSnapshot();
		expect(context.canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(context.size.current.width).toBeGreaterThanOrEqual(0);
		expect(context.size.current.height).toBeGreaterThanOrEqual(0);
		expect(context.graph.getSnapshot()).toBe(graphSnapshot);
		expect(graphSnapshot.schemaVersion).toBe(1);
		expect(Object.isFrozen(graphSnapshot)).toBe(true);
		expect(Object.isFrozen(graphSnapshot.nodes)).toBe(true);

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
		expect(Object.getPrototypeOf(context.user.current)).toBeNull();
		expect(Object.isFrozen(context.user.current)).toBe(true);
		const userInput = { plugin: { enabled: true } };
		context.user.set(userInput);
		expect(context.user.current).toEqual({ plugin: { enabled: true } });
		expect(context.user.current).not.toBe(userInput);
		expect(Object.getPrototypeOf(context.user.current)).toBeNull();
		expect(Object.isFrozen(context.user.current)).toBe(true);
		expect(() => {
			(context.user.current as Record<string, unknown>).corruption = true;
		}).toThrow();

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

		view.unmount();
		expect(context.graph.getSnapshot()).toBe(graphSnapshot);
	});
});
