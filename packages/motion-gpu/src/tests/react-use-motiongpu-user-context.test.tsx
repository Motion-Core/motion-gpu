import { render, waitFor } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../lib/core/current-value.js';
import { createCurrentWritable } from '../lib/core/current-value.js';
import { createFrameRegistry } from '../lib/core/frame-registry.js';
import type { MotionGPUContext } from '../lib/react/motiongpu-context.js';
import { MotionGPUReactContext } from '../lib/react/motiongpu-context.js';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext
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

			useEffect(() => {
				const allEvents: Array<Record<string | symbol, unknown>> = [];
				const pluginEvents: unknown[] = [];

				const unsubscribeAll = allStore.subscribe((value) => {
					allEvents.push(value);
				});
				const unsubscribePlugin = pluginStore.subscribe((value) => {
					pluginEvents.push(value);
				});

				setMotionGPUUserContext('plugin', () => ({ mode: 'first' }), {
					existing: 'replace'
				});
				setMotionGPUUserContext('plugin', () => ({ enabled: true }), {
					existing: 'merge'
				});
				setMotionGPUUserContext<unknown>('plugin', () => 7, {
					existing: 'replace'
				});
				const mergedFallback = setMotionGPUUserContext('plugin', () => ({ mode: 'fallback' }), {
					existing: 'merge'
				});

				const beforeUnsubscribeCounts = {
					all: allEvents.length,
					plugin: pluginEvents.length
				};

				unsubscribeAll();
				unsubscribePlugin();

				setMotionGPUUserContext('plugin', () => ({ mode: 'after-unsubscribe' }), {
					existing: 'replace'
				});

				onProbe({
					allEvents,
					pluginEvents,
					beforeUnsubscribeCounts,
					mergedFallback,
					currentPlugin: pluginStore.current
				});
			}, [allStore, onProbe, pluginStore]);

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

			useEffect(() => {
				setMotionGPUUserContext<unknown>('plugin', () => 7, {
					existing: 'replace'
				});
				const mergedFallback = setMotionGPUUserContext('plugin', () => ({ mode: 'fallback' }), {
					existing: 'merge'
				});

				onProbe({ mergedFallback });
			}, [onProbe]);

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
});
