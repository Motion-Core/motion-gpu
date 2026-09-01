import { cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineMaterial } from '../lib/core/material.js';
import { FragCanvas } from '../lib/react/FragCanvas.js';
import type { SpektralContext } from '../lib/react/spektral-context.js';
import { useSpektral } from '../lib/react/spektral-context.js';

const { createRendererMock } = vi.hoisted(() => ({
	createRendererMock: vi.fn()
}));

vi.mock('../lib/core/renderer', () => ({
	createRenderer: createRendererMock
}));

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.35, 1.0);
}
`
});

interface MockRenderer {
	render: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
}

let rafQueue: FrameRequestCallback[] = [];

async function flushFrame(timestamp: number): Promise<void> {
	const callback = rafQueue.shift();
	if (!callback) {
		throw new Error('No queued animation frame callback');
	}

	callback(timestamp);
	await Promise.resolve();
	await Promise.resolve();
}

function SpektralProbe({ onProbe }: { onProbe: (value: SpektralContext) => void }) {
	const context = useSpektral();

	useEffect(() => {
		onProbe(context);
	}, [context, onProbe]);

	return null;
}

describe('react useSpektral', () => {
	beforeEach(() => {
		rafQueue = [];
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: FrameRequestCallback) => {
				rafQueue.push(callback);
				return rafQueue.length;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		createRendererMock.mockReset();
		createRendererMock.mockResolvedValue({
			render: vi.fn(),
			destroy: vi.fn()
		} satisfies MockRenderer);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('throws when used outside <FragCanvas>', () => {
		function OutsideProbe() {
			useSpektral();
			return null;
		}

		expect(() => render(<OutsideProbe />)).toThrow(/useSpektral must be used inside <FragCanvas>/);
	});

	it('provides runtime context inside <FragCanvas>', async () => {
		const onProbe = vi.fn();
		const view = render(
			<FragCanvas material={material} showErrorOverlay={false}>
				<SpektralProbe onProbe={onProbe} />
			</FragCanvas>
		);

		await flushFrame(16);
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
