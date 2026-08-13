import type { AnyPass, RenderPass, RenderPassInputSlot, RenderPassOutputSlot } from './types.js';
import type { ResolvedComputeAccess, ResolvedComputePassResources } from './compute-resources.js';
import { createMotionGPUError } from './error-report.js';

/**
 * Resolved render-pass step with defaults applied.
 */
export interface RenderGraphStep {
	/**
	 * Step kind. 'render' for post-scene render passes, 'compute' for pre-scene
	 * compute passes, 'feedback' for pre-scene fragment ping-pong passes.
	 */
	kind: 'render' | 'compute' | 'feedback';
	/**
	 * User pass instance.
	 */
	pass: AnyPass;
	/**
	 * Resolved input slot. Ignored for compute steps.
	 */
	input: RenderPassInputSlot;
	/**
	 * Resolved output slot. Ignored for compute steps.
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
	/** Frame-snapshot resources consumed by a compute step. */
	resolvedResources?: ResolvedComputePassResources;
	/** Stable diagnostic label assigned by the renderer. */
	computeLabel?: string;
}

export interface ComputeRenderGraphOptions {
	getResolvedResources: (pass: AnyPass) => ResolvedComputePassResources | undefined;
	getPassLabel?: (pass: AnyPass) => string;
}

/**
 * Immutable render-graph execution plan for one frame.
 */
export interface RenderGraphPlan {
	/**
	 * Resolved enabled steps in declaration order.
	 */
	steps: RenderGraphStep[];
	/**
	 * Enabled pre-scene steps in declaration order.
	 */
	preSceneSteps: RenderGraphStep[];
	/**
	 * Enabled compute steps. These always execute before the base scene render.
	 */
	computeSteps: RenderGraphStep[];
	/**
	 * Enabled render steps. These always execute after the base scene render.
	 */
	renderSteps: RenderGraphStep[];
	/**
	 * Output slot holding final post-scene render result before presentation.
	 * Remains 'canvas' when there are no render steps.
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

interface ComputeDependencyEdge {
	from: number;
	to: number;
	access: ResolvedComputeAccess;
}

function logicalResourceMapKey(access: ResolvedComputeAccess): string | symbol {
	return access.logicalId;
}

function formatLogicalResource(access: ResolvedComputeAccess): string {
	const id =
		typeof access.logicalId === 'symbol'
			? (access.logicalId.description ?? access.logicalId.toString())
			: access.logicalId;
	return `${access.resourceKind} "${id}"`;
}

function stableTopologicalComputeSegment(segment: RenderGraphStep[]): RenderGraphStep[] {
	if (segment.length < 2) return segment;
	const textureWriters = new Map<string | symbol, number>();
	const bufferWriters = new Map<string | symbol, number>();

	for (let index = 0; index < segment.length; index += 1) {
		const step = segment[index];
		if (!step?.resolvedResources) continue;
		for (const access of step.resolvedResources.writes) {
			const writers = access.resourceKind === 'texture' ? textureWriters : bufferWriters;
			const logicalId = logicalResourceMapKey(access);
			const previous = writers.get(logicalId);
			if (previous !== undefined && previous !== index) {
				const previousStep = segment[previous];
				throw createMotionGPUError(
					'COMPUTE_GRAPH_MULTIPLE_WRITERS',
					`Compute graph has multiple writers for ${formatLogicalResource(access)}: ${previousStep?.computeLabel ?? `compute pass #${previous}`} and ${step.computeLabel ?? `compute pass #${index}`} (alias "${access.alias}").`
				);
			}
			writers.set(logicalId, index);
		}
	}

	const edges: ComputeDependencyEdge[] = [];
	const edgeKeys = new Set<string>();
	const addEdge = (from: number, to: number, access: ResolvedComputeAccess): void => {
		if (from === to) return;
		const key = `${from}:${to}`;
		if (edgeKeys.has(key)) return;
		edgeKeys.add(key);
		edges.push({ from, to, access });
	};

	for (let readerIndex = 0; readerIndex < segment.length; readerIndex += 1) {
		const resources = segment[readerIndex]?.resolvedResources;
		if (!resources) continue;
		for (const access of resources.reads) {
			const writers = access.resourceKind === 'texture' ? textureWriters : bufferWriters;
			const writerIndex = writers.get(logicalResourceMapKey(access));
			if (writerIndex === undefined) continue;
			if (access.version === 'initial') {
				addEdge(readerIndex, writerIndex, access);
			} else {
				addEdge(writerIndex, readerIndex, access);
			}
		}
	}

	const outgoing = Array.from({ length: segment.length }, () => [] as ComputeDependencyEdge[]);
	const indegree = new Array<number>(segment.length).fill(0);
	for (const edge of edges) {
		outgoing[edge.from]?.push(edge);
		indegree[edge.to] = (indegree[edge.to] ?? 0) + 1;
	}

	const ready: number[] = [];
	for (let index = 0; index < segment.length; index += 1) {
		if (indegree[index] === 0) ready.push(index);
	}
	const ordered: RenderGraphStep[] = [];
	while (ready.length > 0) {
		ready.sort((left, right) => left - right);
		const index = ready.shift();
		if (index === undefined) break;
		const step = segment[index];
		if (step) ordered.push(step);
		for (const edge of outgoing[index] ?? []) {
			indegree[edge.to] = (indegree[edge.to] ?? 0) - 1;
			if (indegree[edge.to] === 0) ready.push(edge.to);
		}
	}

	if (ordered.length !== segment.length) {
		const blocked = indegree
			.map((count, index) => ({ count, index }))
			.filter(({ count }) => count > 0)
			.map(({ index }) => segment[index]?.computeLabel ?? `compute pass #${index}`);
		const cycleEdges = edges
			.filter((edge) => (indegree[edge.from] ?? 0) > 0 && (indegree[edge.to] ?? 0) > 0)
			.map(
				(edge) =>
					`${segment[edge.from]?.computeLabel ?? `compute pass #${edge.from}`} -> ${segment[edge.to]?.computeLabel ?? `compute pass #${edge.to}`} via ${formatLogicalResource(edge.access)} (alias "${edge.access.alias}")`
			);
		throw createMotionGPUError(
			'COMPUTE_GRAPH_CYCLE',
			`Compute dependency cycle detected among ${blocked.join(', ')}: ${cycleEdges.join('; ')}.`
		);
	}
	return ordered;
}

function planComputeSegments(preSceneSteps: RenderGraphStep[]): RenderGraphStep[] {
	const ordered: RenderGraphStep[] = [];
	let segment: RenderGraphStep[] = [];
	const flush = (): void => {
		if (segment.length === 0) return;
		ordered.push(...stableTopologicalComputeSegment(segment));
		segment = [];
	};

	for (const step of preSceneSteps) {
		if (step.kind === 'compute') {
			segment.push(step);
		} else {
			flush();
			ordered.push(step);
		}
	}
	flush();
	return ordered;
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
	renderTargetSlots?: Iterable<string>,
	computeOptions?: ComputeRenderGraphOptions
): RenderGraphPlan {
	const steps: RenderGraphStep[] = [];
	const preSceneSteps: RenderGraphStep[] = [];
	const computeSteps: RenderGraphStep[] = [];
	const renderSteps: RenderGraphStep[] = [];
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
			const resolvedResources = computeOptions?.getResolvedResources(pass);
			const step: RenderGraphStep = {
				kind: 'compute',
				pass,
				input: 'source',
				output: 'source',
				needsSwap: false,
				clear: false,
				clearColor: cloneClearColor(defaultClearColor),
				preserve: true,
				...(resolvedResources ? { resolvedResources } : {}),
				...(computeOptions?.getPassLabel ? { computeLabel: computeOptions.getPassLabel(pass) } : {})
			};
			steps.push(step);
			preSceneSteps.push(step);
			computeSteps.push(step);
			continue;
		}

		const isFeedback =
			'isPingPongShader' in pass &&
			(pass as { isPingPongShader?: boolean }).isPingPongShader === true;
		if (isFeedback) {
			const step: RenderGraphStep = {
				kind: 'feedback',
				pass,
				input: 'source',
				output: 'source',
				needsSwap: false,
				clear: false,
				clearColor: cloneClearColor(defaultClearColor),
				preserve: true
			};
			steps.push(step);
			preSceneSteps.push(step);
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

		const step: RenderGraphStep = {
			kind: 'render',
			pass,
			input,
			output,
			needsSwap,
			clear,
			clearColor,
			preserve
		};
		steps.push(step);
		renderSteps.push(step);

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

	const orderedPreSceneSteps = computeOptions ? planComputeSegments(preSceneSteps) : preSceneSteps;
	const orderedComputeSteps = orderedPreSceneSteps.filter((step) => step.kind === 'compute');

	return {
		steps,
		preSceneSteps: orderedPreSceneSteps,
		computeSteps: computeOptions ? orderedComputeSteps : computeSteps,
		renderSteps,
		finalOutput
	};
}
