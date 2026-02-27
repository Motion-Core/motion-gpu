import type { RenderPass, RenderPassInputSlot, RenderPassOutputSlot } from './types';

/**
 * Resolved render-pass step with defaults applied.
 */
export interface RenderGraphStep {
	/**
	 * User pass instance.
	 */
	pass: RenderPass;
	/**
	 * Resolved input slot.
	 */
	input: RenderPassInputSlot;
	/**
	 * Resolved output slot.
	 */
	output: RenderPassOutputSlot;
	/**
	 * Whether ping-pong swap should be performed after render.
	 */
	needsSwap: boolean;
	/**
	 * Whether pass should clear output before drawing.
	 */
	clear: boolean;
	/**
	 * Effective clear color.
	 */
	clearColor: [number, number, number, number];
	/**
	 * Whether output should be preserved after pass ends.
	 */
	preserve: boolean;
}

/**
 * Immutable render-graph execution plan for one frame.
 */
export interface RenderGraphPlan {
	/**
	 * Resolved enabled steps in execution order.
	 */
	steps: RenderGraphStep[];
	/**
	 * Output slot holding final frame result before presentation.
	 */
	finalOutput: RenderPassOutputSlot;
}

/**
 * Creates a copy of RGBA clear color.
 */
function cloneClearColor(
	color: [number, number, number, number]
): [number, number, number, number] {
	return [color[0], color[1], color[2], color[3]];
}

/**
 * Builds validated render graph plan from runtime pass list.
 *
 * @param passes - Runtime passes.
 * @param defaultClearColor - Global clear color fallback.
 * @returns Resolved render graph plan.
 */
export function planRenderGraph(
	passes: RenderPass[] | undefined,
	defaultClearColor: [number, number, number, number]
): RenderGraphPlan {
	const steps: RenderGraphStep[] = [];
	const availableSlots = new Set<RenderPassInputSlot | RenderPassOutputSlot>(['source']);
	let finalOutput: RenderPassOutputSlot = 'canvas';
	let enabledIndex = 0;

	for (const pass of passes ?? []) {
		if (pass.enabled === false) {
			continue;
		}

		const needsSwap = pass.needsSwap ?? true;
		const input: RenderPassInputSlot = pass.input ?? 'source';
		const output: RenderPassOutputSlot = pass.output ?? (needsSwap ? 'target' : 'source');

		if (needsSwap && (input !== 'source' || output !== 'target')) {
			throw new Error(
				`Render pass #${enabledIndex} uses needsSwap=true but does not follow source->target flow.`
			);
		}

		if (!availableSlots.has(input)) {
			throw new Error(`Render pass #${enabledIndex} reads "${input}" before it is written.`);
		}

		const clear = pass.clear ?? false;
		const clearColor = cloneClearColor(pass.clearColor ?? defaultClearColor);
		const preserve = pass.preserve ?? true;

		steps.push({
			pass,
			input,
			output,
			needsSwap,
			clear,
			clearColor,
			preserve
		});

		if (needsSwap) {
			availableSlots.add('target');
			availableSlots.add('source');
			finalOutput = 'source';
		} else {
			if (output !== 'canvas') {
				availableSlots.add(output);
			}
			finalOutput = output;
		}

		enabledIndex += 1;
	}

	return {
		steps,
		finalOutput
	};
}
