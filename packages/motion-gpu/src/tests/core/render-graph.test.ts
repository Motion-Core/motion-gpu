import { describe, expect, it } from 'vitest';
import { planRenderGraph } from '../../lib/core/render-graph';
import type { RenderPass } from '../../lib/core/types';

function createPass(input?: Partial<RenderPass>): RenderPass {
	return {
		render: () => {},
		...input
	};
}

describe('render graph planner', () => {
	it('returns canvas output when no passes are enabled', () => {
		const plan = planRenderGraph([], [0, 0, 0, 1]);
		expect(plan.steps).toEqual([]);
		expect(plan.finalOutput).toBe('canvas');
	});

	it('applies default source->target swap flow', () => {
		const plan = planRenderGraph([createPass()], [0.1, 0.2, 0.3, 1]);
		expect(plan.steps).toHaveLength(1);
		expect(plan.steps[0]).toMatchObject({
			input: 'source',
			output: 'target',
			needsSwap: true,
			clear: false,
			preserve: true,
			clearColor: [0.1, 0.2, 0.3, 1]
		});
		expect(plan.finalOutput).toBe('source');
	});

	it('skips disabled passes', () => {
		const plan = planRenderGraph(
			[createPass({ enabled: false }), createPass({ needsSwap: false, output: 'canvas' })],
			[0, 0, 0, 1]
		);

		expect(plan.steps).toHaveLength(1);
		expect(plan.finalOutput).toBe('canvas');
	});

	it('supports target->canvas flow without swap', () => {
		const plan = planRenderGraph(
			[
				createPass({ needsSwap: false, output: 'target' }),
				createPass({ needsSwap: false, input: 'target', output: 'canvas' })
			],
			[0, 0, 0, 1]
		);

		expect(plan.steps).toHaveLength(2);
		expect(plan.steps[1]).toMatchObject({ input: 'target', output: 'canvas', needsSwap: false });
		expect(plan.finalOutput).toBe('canvas');
	});

	it('rejects invalid needsSwap configuration', () => {
		expect(() =>
			planRenderGraph([createPass({ needsSwap: true, output: 'canvas' })], [0, 0, 0, 1])
		).toThrow(/source->target flow/);
	});

	it('rejects reading target before it is written', () => {
		expect(() =>
			planRenderGraph(
				[createPass({ needsSwap: false, input: 'target', output: 'canvas' })],
				[0, 0, 0, 1]
			)
		).toThrow(/before it is written/);
	});
});
