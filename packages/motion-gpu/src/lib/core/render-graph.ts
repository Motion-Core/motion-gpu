import type { AnyPass, RenderPass, RenderPassInputSlot, RenderPassOutputSlot } from './types.js';

/**
 * Resolved render-pass step with defaults applied.
 */
export interface RenderGraphStep {
	/**
	 * Step kind. 'render' for existing passes, 'compute' for compute passes.
	 */
	kind: 'render' | 'compute';
	/**
	 * User pass instance.
	 */
	pass: AnyPass;
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
	passes: AnyPass[] | undefined,
	defaultClearColor: [number, number, number, number],
	renderTargetSlots?: Iterable<string>
): RenderGraphPlan {
	const steps: RenderGraphStep[] = [];
	const declaredTargets = new Set(renderTargetSlots ?? []);
	const availableSlots = new Set<RenderPassInputSlot | RenderPassOutputSlot>(['source']);
	let finalOutput: RenderPassOutputSlot = 'canvas';
	let enabledIndex = 0;

	for (const pass of passes ?? []) {
		if (pass.enabled === false) {
			continue;
		}

		// Compute passes don't participate in slot routing
		const isCompute = 'isCompute' in pass && (pass as { isCompute?: boolean }).isCompute === true;
		if (isCompute) {
			steps.push({
				kind: 'compute',
				pass,
				input: 'source',
				output: 'source',
				needsSwap: false,
				clear: false,
				clearColor: cloneClearColor(defaultClearColor),
				preserve: true
			});
			continue;
		}

		// After compute guard, pass is a render pass
		const rp = pass as RenderPass;
		const needsSwap = rp.needsSwap ?? true;
		const input: RenderPassInputSlot = rp.input ?? 'source';
		const output: RenderPassOutputSlot = rp.output ?? (needsSwap ? 'target' : 'source');

		if (input === 'canvas') {
			throw new Error(`Render pass #${enabledIndex} cannot read from "canvas".`);
		}

		const inputIsNamed = input !== 'source' && input !== 'target';
		if (inputIsNamed && !declaredTargets.has(input)) {
			throw new Error(`Render pass #${enabledIndex} reads unknown target "${input}".`);
		}

		const outputIsNamed = output !== 'source' && output !== 'target' && output !== 'canvas';
		if (outputIsNamed && !declaredTargets.has(output)) {
			throw new Error(`Render pass #${enabledIndex} writes unknown target "${output}".`);
		}

		if (needsSwap && (input !== 'source' || output !== 'target')) {
			throw new Error(
				`Render pass #${enabledIndex} uses needsSwap=true but does not follow source->target flow.`
			);
		}

		if (!availableSlots.has(input)) {
			throw new Error(`Render pass #${enabledIndex} reads "${input}" before it is written.`);
		}

		const clear = rp.clear ?? false;
		const clearColor = cloneClearColor(rp.clearColor ?? defaultClearColor);
		const preserve = rp.preserve ?? true;

		steps.push({
			kind: 'render',
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

	// When steps exist (even compute-only) but no render pass changed
	// finalOutput from 'canvas', the scene was drawn to 'source' and
	// needs blitting to the canvas surface.
	if (steps.length > 0 && enabledIndex === 0) {
		finalOutput = 'source';
	}

	return {
		steps,
		finalOutput
	};
}
