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
		expect(plan.steps[1]).toMatchObject({
			input: 'target',
			output: 'canvas',
			needsSwap: false
		});
		expect(plan.finalOutput).toBe('canvas');
	});

	it('supports named target flow and tracks named final output', () => {
		const plan = planRenderGraph(
			[createPass({ needsSwap: false, output: 'fxMain' })],
			[0, 0, 0, 1],
			['fxMain']
		);

		expect(plan.steps).toHaveLength(1);
		expect(plan.steps[0]).toMatchObject({
			input: 'source',
			output: 'fxMain',
			needsSwap: false
		});
		expect(plan.finalOutput).toBe('fxMain');
	});

	it('supports reading from named target after write', () => {
		const plan = planRenderGraph(
			[
				createPass({ needsSwap: false, output: 'fxMain' }),
				createPass({ needsSwap: false, input: 'fxMain', output: 'canvas' })
			],
			[0, 0, 0, 1],
			['fxMain']
		);

		expect(plan.steps).toHaveLength(2);
		expect(plan.steps[1]).toMatchObject({
			input: 'fxMain',
			output: 'canvas'
		});
		expect(plan.finalOutput).toBe('canvas');
	});

	it('clones clear color values to avoid shared mutable references', () => {
		const clearColor: [number, number, number, number] = [0.2, 0.3, 0.4, 1];
		const plan = planRenderGraph([createPass({ clear: true, clearColor })], [0, 0, 0, 1]);

		clearColor[0] = 0.99;
		expect(plan.steps[0]?.clearColor).toEqual([0.2, 0.3, 0.4, 1]);
	});

	it('counts pass index using enabled passes when reporting validation errors', () => {
		expect(() =>
			planRenderGraph(
				[
					createPass({ enabled: false, needsSwap: true, output: 'canvas' }),
					createPass({ needsSwap: false, output: 'target' }),
					createPass({ needsSwap: true, output: 'canvas' })
				],
				[0, 0, 0, 1]
			)
		).toThrow(/Render pass #1 uses needsSwap=true/);
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

	it('rejects writing unknown named targets', () => {
		expect(() =>
			planRenderGraph([createPass({ needsSwap: false, output: 'fxMain' })], [0, 0, 0, 1])
		).toThrow(/writes unknown target "fxMain"/);
	});

	it('rejects reading unknown named targets', () => {
		expect(() =>
			planRenderGraph(
				[createPass({ needsSwap: false, input: 'fxMain', output: 'canvas' })],
				[0, 0, 0, 1]
			)
		).toThrow(/reads unknown target "fxMain"/);
	});

	it('rejects reading named target before it is written', () => {
		expect(() =>
			planRenderGraph(
				[createPass({ needsSwap: false, input: 'fxMain', output: 'canvas' })],
				[0, 0, 0, 1],
				['fxMain']
			)
		).toThrow(/before it is written/);
	});
});
