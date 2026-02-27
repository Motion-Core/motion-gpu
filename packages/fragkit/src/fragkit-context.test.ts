import { render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FragkitContext } from './lib/fragkit-context';
import FragkitOutside from './test-fixtures/FragkitOutside.svelte';
import FragkitWithProbe from './test-fixtures/FragkitWithProbe.svelte';

describe('useFragkit', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'gpu');
	});

	it('throws when used outside <FragCanvas>', () => {
		expect(() => render(FragkitOutside)).toThrow(/useFragkit must be used inside <FragCanvas>/);
	});

	it('provides runtime context inside <FragCanvas>', async () => {
		const onProbe = vi.fn();
		render(FragkitWithProbe, { props: { onProbe } });

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const context = onProbe.mock.calls[0]?.[0] as FragkitContext;
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

		const createdStage = context.scheduler.createStage('post');
		expect(createdStage.key).toBe('post');
		expect(context.scheduler.getStage('post')?.key).toBe('post');
	});
});
