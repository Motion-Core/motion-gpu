import { render, waitFor } from '@testing-library/react';
import { useEffect, useRef, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../lib/core/current-value.js';
import { createCurrentWritable } from '../lib/core/current-value.js';
import { createFrameRegistry } from '../lib/core/frame-registry.js';
import type { MotionGPUContext } from '../lib/react/motiongpu-context.js';
import { MotionGPUReactContext } from '../lib/react/motiongpu-context.js';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext,
	useSetMotionGPUUserContext
} from '../lib/react/use-motiongpu-user-context.js';

function createRuntimeHarness() {
	const registry = createFrameRegistry();
	const context: MotionGPUContext = {
		canvas: undefined,
		size: createCurrentWritable({ width: 0, height: 0 }),
		dpr: createCurrentWritable(1),
		maxDelta: createCurrentWritable(0.1),
		renderMode: createCurrentWritable<'always' | 'manual' | 'on-demand'>('always'),
		autoRender: createCurrentWritable(true),
		user: createCurrentWritable<Record<string | symbol, unknown>>({}),
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

	return { context };
}

function withProvider(
	ui: ReactElement,
	payload: ReturnType<typeof createRuntimeHarness>
): ReactElement {
	return (
		<MotionGPUReactContext.Provider value={payload.context}>{ui}</MotionGPUReactContext.Provider>
	);
}

describe('react useMotionGPUUserContext', () => {
	it('throws when used outside <FragCanvas>', () => {
		function OutsideProbe() {
			useMotionGPUUserContext();
			return null;
		}

		expect(() => render(<OutsideProbe />)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('throws when setMotionGPUUserContext is called outside React render lifecycle', () => {
		const payload = createRuntimeHarness();

		function PrimeStore() {
			useMotionGPUUserContext();
			return null;
		}

		render(withProvider(<PrimeStore />, payload));

		expect(() => {
			setMotionGPUUserContext('plugin', () => ({ mode: 'outside-render' }), {
				existing: 'replace'
			});
		}).toThrow();
		expect(payload.context.user.current.plugin).toBeUndefined();
	});

	it('supports scoped set/get with skip, merge and replace modes', async () => {
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

		render(withProvider(<Probe />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			initial: Record<string, unknown>;
			skipped: Record<string, unknown>;
			merged: Record<string, unknown>;
			replaced: Record<string, unknown>;
			skippedAfterReplace: Record<string, unknown>;
			pluginStore: CurrentReadable<Record<string, unknown> | undefined>;
			allStore: CurrentReadable<Record<string | symbol, unknown>>;
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
		expect(result.merged).toEqual({ mode: 'initial', enabled: true, merged: true });
		expect(result.replaced).toEqual({ mode: 'replaced' });
		expect(result.skippedAfterReplace).toEqual({ mode: 'replaced' });
		expect(result.pluginStore.current).toEqual({ mode: 'replaced' });
		expect(result.allStore.current.plugin).toEqual({ mode: 'replaced' });
		expect(result.contextRefs.afterInitial).not.toBe(result.contextRefs.beforeInitial);
		expect(result.contextRefs.afterMerged).not.toBe(result.contextRefs.afterSkipped);
		expect(result.contextRefs.afterReplaced).not.toBe(result.contextRefs.afterMerged);
		expect(result.contextRefs.afterSkippedAfterReplace).toBe(result.contextRefs.afterReplaced);
	});

	it('emits updates via all-store and scoped-store subscriptions and stops after unsubscribe', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		function SubscribeProbe() {
			const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
			const pluginStore = useMotionGPUUserContext<unknown>('plugin');
			const setUserContext = useSetMotionGPUUserContext();

			useEffect(() => {
				const allEvents: Array<Record<string | symbol, unknown>> = [];
				const pluginEvents: unknown[] = [];

				const unsubscribeAll = allStore.subscribe((value) => {
					allEvents.push(value);
				});
				const unsubscribePlugin = pluginStore.subscribe((value) => {
					pluginEvents.push(value);
				});

				setUserContext('plugin', () => ({ mode: 'first' }), {
					existing: 'replace'
				});
				setUserContext('plugin', () => ({ enabled: true }), {
					existing: 'merge'
				});
				setUserContext<unknown>('plugin', () => 7, {
					existing: 'replace'
				});
				const mergedFallback = setUserContext('plugin', () => ({ mode: 'fallback' }), {
					existing: 'merge'
				});

				const beforeUnsubscribeCounts = {
					all: allEvents.length,
					plugin: pluginEvents.length
				};

				unsubscribeAll();
				unsubscribePlugin();

				setUserContext('plugin', () => ({ mode: 'after-unsubscribe' }), {
					existing: 'replace'
				});

				onProbe({
					allEvents,
					pluginEvents,
					beforeUnsubscribeCounts,
					mergedFallback,
					currentPlugin: pluginStore.current
				});
			}, [allStore, onProbe, pluginStore, setUserContext]);

			return null;
		}

		render(withProvider(<SubscribeProbe />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			allEvents: Array<Record<string | symbol, unknown>>;
			pluginEvents: unknown[];
			beforeUnsubscribeCounts: { all: number; plugin: number };
			mergedFallback: Record<string, unknown>;
			currentPlugin: Record<string, unknown>;
		};

		expect(result.beforeUnsubscribeCounts).toEqual({ all: 5, plugin: 5 });
		expect(result.allEvents).toHaveLength(5);
		expect(result.pluginEvents).toEqual([
			undefined,
			{ mode: 'first' },
			{ mode: 'first', enabled: true },
			7,
			{ mode: 'fallback' }
		]);
		expect(result.currentPlugin).toEqual({ mode: 'after-unsubscribe' });
	});

	it('falls back to replace semantics when merge mode receives a non-object existing value', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		function MergeFallbackProbe() {
			useMotionGPUUserContext<unknown>('plugin');
			const setUserContext = useSetMotionGPUUserContext();

			useEffect(() => {
				setUserContext<unknown>('plugin', () => 7, {
					existing: 'replace'
				});
				const mergedFallback = setUserContext('plugin', () => ({ mode: 'fallback' }), {
					existing: 'merge'
				});

				onProbe({ mergedFallback });
			}, [onProbe, setUserContext]);

			return null;
		}

		render(withProvider(<MergeFallbackProbe />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			mergedFallback: Record<string, unknown>;
		};
		expect(result.mergedFallback).toEqual({ mode: 'fallback' });
	});

	it('returns stable store references across rerenders for the same namespace', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		function StabilityProbe({ step }: { step: number }) {
			const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
			const pluginStore = useMotionGPUUserContext<unknown>('plugin');
			const lastRef = useRef<{
				allStore: CurrentReadable<Record<string | symbol, unknown>>;
				pluginStore: CurrentReadable<unknown | undefined>;
			} | null>(null);

			useEffect(() => {
				onProbe({
					step,
					sameAllStore: lastRef.current ? lastRef.current.allStore === allStore : true,
					samePluginStore: lastRef.current ? lastRef.current.pluginStore === pluginStore : true
				});
				lastRef.current = {
					allStore,
					pluginStore
				};
			}, [allStore, onProbe, pluginStore, step]);

			return null;
		}

		const view = render(withProvider(<StabilityProbe step={0} />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		view.rerender(withProvider(<StabilityProbe step={1} />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(2);
		});

		view.rerender(withProvider(<StabilityProbe step={2} />, payload));
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(3);
		});

		expect(onProbe.mock.calls[1]?.[0]).toMatchObject({
			sameAllStore: true,
			samePluginStore: true
		});
		expect(onProbe.mock.calls[2]?.[0]).toMatchObject({
			sameAllStore: true,
			samePluginStore: true
		});
	});
});
