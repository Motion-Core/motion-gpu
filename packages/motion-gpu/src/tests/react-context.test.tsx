import { render, waitFor } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createCurrentWritable } from '../lib/core/current-value';
import { createFrameRegistry } from '../lib/core/frame-registry';
import type { MotionGPUContext } from '../lib/react/motiongpu-context';
import { MotionGPUReactContext, useMotionGPU } from '../lib/react/motiongpu-context';
import {
	FrameRegistryReactContext,
	useFrame,
	type UseFrameResult
} from '../lib/react/frame-context';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext
} from '../lib/react/use-motiongpu-user-context';

function createRuntimeHarness() {
	const registry = createFrameRegistry();
	const size = createCurrentWritable({ width: 0, height: 0 });
	const dpr = createCurrentWritable(1);
	const maxDelta = createCurrentWritable(0.1);
	const renderMode = createCurrentWritable<'always' | 'manual' | 'on-demand'>('always');
	const autoRender = createCurrentWritable(true);
	const user = createCurrentWritable<Record<string | symbol, unknown>>({});

	const context: MotionGPUContext = {
		canvas: undefined,
		size,
		dpr,
		maxDelta,
		renderMode,
		autoRender,
		user,
		invalidate: () => {
			registry.invalidate();
		},
		advance: () => {
			registry.advance();
		},
		scheduler: {
			createStage: registry.createStage,
			getStage: registry.getStage,
			setDiagnosticsEnabled: registry.setDiagnosticsEnabled,
			getDiagnosticsEnabled: registry.getDiagnosticsEnabled,
			getLastRunTimings: registry.getLastRunTimings,
			getSchedule: registry.getSchedule,
			setProfilingEnabled: registry.setProfilingEnabled,
			setProfilingWindow: registry.setProfilingWindow,
			resetProfiling: registry.resetProfiling,
			getProfilingEnabled: registry.getProfilingEnabled,
			getProfilingWindow: registry.getProfilingWindow,
			getProfilingSnapshot: registry.getProfilingSnapshot
		}
	};

	return { context, registry };
}

function withProviders(
	ui: ReactElement,
	payload: ReturnType<typeof createRuntimeHarness>
): ReactElement {
	return (
		<FrameRegistryReactContext.Provider value={payload.registry}>
			<MotionGPUReactContext.Provider value={payload.context}>{ui}</MotionGPUReactContext.Provider>
		</FrameRegistryReactContext.Provider>
	);
}

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

describe('react adapter runtime hooks', () => {
	it('throws when useMotionGPU is called outside provider', () => {
		function Probe() {
			useMotionGPU();
			return null;
		}

		expect(() => render(<Probe />)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('registers useFrame callbacks and auto-unsubscribes on unmount', async () => {
		const payload = createRuntimeHarness();
		const callback = vi.fn();
		const onRegistration = vi.fn();

		function Probe() {
			const registration = useFrame('probe-task', callback);
			useEffect(() => {
				onRegistration(registration);
			}, [registration]);
			return null;
		}

		const view = render(withProviders(<Probe />, payload));
		await waitFor(() => {
			expect(onRegistration).toHaveBeenCalledTimes(1);
		});
		const registration = onRegistration.mock.calls[0]?.[0] as UseFrameResult;

		await waitFor(() => {
			const stageWithTask = payload.registry
				.getSchedule()
				.stages.some((stage) => stage.tasks.includes('probe-task'));
			expect(stageWithTask).toBe(true);
		});

		expect(registration.task.key).toBe('probe-task');
		let startedValue = false;
		const unsubscribeStarted = registration.started.subscribe((value) => {
			startedValue = value;
		});
		expect(startedValue).toBe(true);
		unsubscribeStarted();

		payload.registry.run(createState(payload.registry));
		expect(callback).toHaveBeenCalledTimes(1);

		view.unmount();
		payload.registry.run(createState(payload.registry));
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('throws when useFrame is called outside FrameRegistry provider', () => {
		function Probe() {
			useFrame(() => undefined);
			return null;
		}

		expect(() =>
			render(
				<MotionGPUReactContext.Provider value={createRuntimeHarness().context}>
					<Probe />
				</MotionGPUReactContext.Provider>
			)
		).toThrow(/useFrame must be used inside <FragCanvas>/);
	});

	it('supports skip, merge and replace user-context semantics', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		function Probe() {
			const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
			const beforeInitial = allStore.current;
			const initial = setMotionGPUUserContext('plugin', () => ({ mode: 'initial', enabled: true }));
			const afterInitial = allStore.current;
			const skipped = setMotionGPUUserContext('plugin', () => ({ mode: 'skipped' }));
			const afterSkipped = allStore.current;
			const merged = setMotionGPUUserContext('plugin', () => ({ merged: true }), {
				existing: 'merge'
			});
			const afterMerged = allStore.current;
			const replaced = setMotionGPUUserContext('plugin', () => ({ mode: 'replaced' }), {
				existing: 'replace'
			});
			const afterReplaced = allStore.current;
			const skippedAfterReplace = setMotionGPUUserContext('plugin', () => ({ mode: 'unchanged' }));
			const afterSkippedAfterReplace = allStore.current;
			const pluginStore = useMotionGPUUserContext<Record<string, unknown>>('plugin');

			useEffect(() => {
				onProbe({
					initial,
					skipped,
					merged,
					replaced,
					skippedAfterReplace,
					pluginStore,
					allStore,
					contextRefs: {
						beforeInitial,
						afterInitial,
						afterSkipped,
						afterMerged,
						afterReplaced,
						afterSkippedAfterReplace
					}
				});
			}, [
				allStore,
				afterInitial,
				afterMerged,
				afterReplaced,
				afterSkipped,
				afterSkippedAfterReplace,
				beforeInitial,
				initial,
				merged,
				onProbe,
				pluginStore,
				replaced,
				skipped,
				skippedAfterReplace
			]);

			return null;
		}

		render(withProviders(<Probe />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			initial: Record<string, unknown>;
			skipped: Record<string, unknown>;
			merged: Record<string, unknown>;
			replaced: Record<string, unknown>;
			skippedAfterReplace: Record<string, unknown>;
			pluginStore: { current: Record<string, unknown> | undefined };
			allStore: { current: Record<string | symbol, unknown> };
			contextRefs: {
				beforeInitial: Record<string | symbol, unknown>;
				afterInitial: Record<string | symbol, unknown>;
				afterSkipped: Record<string | symbol, unknown>;
				afterMerged: Record<string | symbol, unknown>;
				afterReplaced: Record<string | symbol, unknown>;
				afterSkippedAfterReplace: Record<string | symbol, unknown>;
			};
		};

		expect(result.initial).toEqual({ mode: 'initial', enabled: true });
		expect(result.skipped).toEqual({ mode: 'initial', enabled: true });
		expect(result.merged).toEqual({
			mode: 'initial',
			enabled: true,
			merged: true
		});
		expect(result.replaced).toEqual({ mode: 'replaced' });
		expect(result.skippedAfterReplace).toEqual({ mode: 'replaced' });

		expect(result.pluginStore.current).toEqual({ mode: 'replaced' });
		expect(result.allStore.current.plugin).toEqual({ mode: 'replaced' });
		expect(result.contextRefs.afterInitial).not.toBe(result.contextRefs.beforeInitial);
		expect(result.contextRefs.afterMerged).not.toBe(result.contextRefs.afterSkipped);
		expect(result.contextRefs.afterReplaced).not.toBe(result.contextRefs.afterMerged);
		expect(result.contextRefs.afterSkippedAfterReplace).toBe(result.contextRefs.afterReplaced);
	});
});
