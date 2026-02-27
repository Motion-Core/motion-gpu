import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../lib/current-writable';
import MotionGPUUserOutside from './fixtures/MotionGPUUserOutside.svelte';
import MotionGPUWithUserProbe from './fixtures/MotionGPUWithUserProbe.svelte';

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
			pluginStore: CurrentReadable<Record<string, unknown> | undefined>;
			allStore: CurrentReadable<Record<string | symbol, unknown>>;
		};

		expect(result.initial).toEqual({ mode: 'initial', enabled: true });
		expect(result.skipped).toEqual({ mode: 'initial', enabled: true });
		expect(result.merged).toEqual({ mode: 'initial', enabled: true, merged: true });
		expect(result.replaced).toEqual({ mode: 'replaced' });

		expect(result.pluginStore.current).toEqual({ mode: 'replaced' });
		expect(result.allStore.current.plugin).toEqual({ mode: 'replaced' });
	});
});
