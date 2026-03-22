import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../lib/core/current-value';
import MotionGPUUserOutside from './fixtures/MotionGPUUserOutside.svelte';
import MotionGPUWithUserFunctionValueProbe from './fixtures/MotionGPUWithUserFunctionValueProbe.svelte';
import MotionGPUWithUserProbe from './fixtures/MotionGPUWithUserProbe.svelte';
import MotionGPUWithUserSubscribeProbe from './fixtures/MotionGPUWithUserSubscribeProbe.svelte';
import MotionGPUWithUserTypedNamespaceProbe from './fixtures/MotionGPUWithUserTypedNamespaceProbe.svelte';

describe('useMotionGPUUserContext', () => {
	it('throws when used outside <FragCanvas>', () => {
		expect(() => render(MotionGPUUserOutside)).toThrow(
			/useMotionGPU must be used inside <FragCanvas>/
		);
	});

	it('supports scoped set/get with skip, merge and replace modes', async () => {
		const onProbe = vi.fn();
		render(MotionGPUWithUserProbe, { props: { onProbe } });

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

	it('emits updates via all-store and scoped-store subscriptions and stops after unsubscribe', async () => {
		const onProbe = vi.fn();
		render(MotionGPUWithUserSubscribeProbe, { props: { onProbe } });

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
		const onProbe = vi.fn();
		render(MotionGPUWithUserSubscribeProbe, { props: { onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			mergedFallback: Record<string, unknown>;
		};
		expect(result.mergedFallback).toEqual({ mode: 'fallback' });
	});

	it('stores function values when functionValue mode is set to value', async () => {
		const onProbe = vi.fn();
		render(MotionGPUWithUserFunctionValueProbe, { props: { onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			sameReference: boolean;
			callsAfterSet: number;
			invokedValue: string | null;
			callsAfterInvoke: number;
			lazyValue: { mode: string };
		};

		expect(result.sameReference).toBe(true);
		expect(result.callsAfterSet).toBe(0);
		expect(result.invokedValue).toBe('svelte-function');
		expect(result.callsAfterInvoke).toBe(1);
		expect(result.lazyValue).toEqual({ mode: 'lazy' });
	});

	it('infers scoped namespace value type from typed context map', async () => {
		const onProbe = vi.fn();
		render(MotionGPUWithUserTypedNamespaceProbe, { props: { onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		expect(onProbe.mock.calls[0]?.[0]).toEqual({ enabled: true });
	});
});
