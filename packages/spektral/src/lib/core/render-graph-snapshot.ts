import type { ResolvedComputeAccess } from './compute-resources.js';
import type { ComputeDependencyReason } from './render-graph-dependencies.js';
import type { RenderGraphPlan, RenderGraphStep } from './render-graph.js';
import type { RenderPassInputSlot, RenderPassOutputSlot } from './types.js';

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotSubresource {
	readonly baseMipLevel: number;
	readonly mipLevelCount: number;
	readonly baseArrayLayer: number;
	readonly arrayLayerCount: 1;
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotResource {
	readonly id: string;
	readonly physicalId: string;
	readonly resourceKind: 'texture' | 'buffer';
	readonly logicalIds: readonly string[];
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotResourceAccess {
	readonly resourceId: string;
	readonly alias: string;
	readonly logicalId: string;
	readonly mode: 'read' | 'write';
	readonly readVersion?: 'current' | 'initial';
	readonly subresource?: RenderGraphSnapshotSubresource;
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotNode {
	readonly id: string;
	readonly kind: 'compute' | 'feedback' | 'base-scene' | 'render';
	readonly phase: 'pre-scene' | 'base-scene' | 'post-scene';
	readonly declarationIndex: number | null;
	readonly executionIndex: number;
	readonly label: string;
	readonly userLabel?: string;
	readonly input: RenderPassInputSlot;
	readonly output: RenderPassOutputSlot;
	readonly resources: readonly RenderGraphSnapshotResourceAccess[];
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotReadWriteReason {
	readonly type: 'resource-hazard';
	readonly hazard: 'RAW' | 'WAR';
	readonly resourceKind: 'texture' | 'buffer';
	readonly physicalId: string;
	readonly readVersion: 'current' | 'initial';
	readonly readerAlias: string;
	readonly readerLogicalId: string;
	readonly readerSubresource?: RenderGraphSnapshotSubresource;
	readonly writerAlias: string;
	readonly writerLogicalId: string;
	readonly writerSubresource?: RenderGraphSnapshotSubresource;
	readonly textureOverlap?: RenderGraphSnapshotSubresource;
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotWriteConflictReason {
	readonly type: 'resource-hazard';
	readonly hazard: 'WAW';
	readonly resourceKind: 'texture' | 'buffer';
	readonly physicalId: string;
	readonly firstWriterAlias: string;
	readonly firstWriterLogicalId: string;
	readonly secondWriterAlias: string;
	readonly secondWriterLogicalId: string;
	readonly textureOverlap?: RenderGraphSnapshotSubresource;
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotPingPongReason {
	readonly type: 'resource-hazard';
	readonly hazard: 'ping-pong';
	readonly physicalId: string;
	readonly readAlias: string;
	readonly writeAlias: string;
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotSlotFlowReason {
	readonly type: 'slot-flow';
	readonly hazard: 'slot-flow';
	readonly slot: RenderPassInputSlot | RenderPassOutputSlot;
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotPhaseFlowReason {
	readonly type: 'phase-flow';
	readonly hazard: 'phase-flow';
	readonly transition: 'pre-scene-to-base-scene' | 'base-scene-to-post-scene';
}

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export type RenderGraphSnapshotEdgeReason =
	| RenderGraphSnapshotReadWriteReason
	| RenderGraphSnapshotWriteConflictReason
	| RenderGraphSnapshotPingPongReason
	| RenderGraphSnapshotSlotFlowReason
	| RenderGraphSnapshotPhaseFlowReason;

/** @experimental Render graph snapshot schema may evolve before Spektral 1.0. */
export interface RenderGraphSnapshotEdge {
	readonly from: string;
	readonly to: string;
	readonly reasons: readonly RenderGraphSnapshotEdgeReason[];
}

/**
 * Serializable, deeply frozen view of the current render graph plan.
 *
 * @experimental The schema may evolve before Spektral 1.0.
 */
export interface RenderGraphSnapshot {
	readonly schemaVersion: 1;
	readonly nodes: readonly RenderGraphSnapshotNode[];
	readonly resources: readonly RenderGraphSnapshotResource[];
	readonly edges: readonly RenderGraphSnapshotEdge[];
	readonly finalOutput: RenderPassOutputSlot;
}

export interface RenderGraphSnapshotBuilder {
	readonly empty: RenderGraphSnapshot;
	build: (plan: RenderGraphPlan | null | undefined) => RenderGraphSnapshot;
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
	for (const nested of Object.values(value)) deepFreeze(nested);
	return Object.freeze(value);
}

/** @internal Shared empty state used before initialization and after teardown. */
export const EMPTY_RENDER_GRAPH_SNAPSHOT: RenderGraphSnapshot = deepFreeze({
	schemaVersion: 1,
	nodes: [],
	resources: [],
	edges: [],
	finalOutput: 'canvas'
});

class OpaqueIdentityRegistry {
	private readonly prefix: 'node' | 'resource';
	private readonly objectIds = new WeakMap<object, string>();
	private readonly primitiveIds = new Map<string | symbol, string>();
	private nextId = 1;

	constructor(prefix: 'node' | 'resource') {
		this.prefix = prefix;
	}

	get(value: object | string | symbol): string {
		if (typeof value === 'object') {
			const existing = this.objectIds.get(value);
			if (existing !== undefined) return existing;
			const id = `${this.prefix}-${this.nextId}`;
			this.nextId += 1;
			this.objectIds.set(value, id);
			return id;
		}
		const existing = this.primitiveIds.get(value);
		if (existing !== undefined) return existing;
		const id = `${this.prefix}-${this.nextId}`;
		this.nextId += 1;
		this.primitiveIds.set(value, id);
		return id;
	}
}

function logicalId(value: string | symbol): string {
	return typeof value === 'string' ? value : (value.description ?? value.toString());
}

function copySubresource(
	subresource: RenderGraphSnapshotSubresource
): RenderGraphSnapshotSubresource {
	return { ...subresource };
}

function snapshotResourceAccess(
	access: ResolvedComputeAccess,
	identities: OpaqueIdentityRegistry
): RenderGraphSnapshotResourceAccess {
	return {
		resourceId: identities.get(access.physicalId),
		alias: access.alias,
		logicalId: logicalId(access.logicalId),
		mode: access.mode,
		...(access.mode === 'read' ? { readVersion: access.version } : {}),
		...(access.subresource ? { subresource: copySubresource(access.subresource) } : {})
	};
}

function snapshotReason(
	reason: ComputeDependencyReason,
	identities: OpaqueIdentityRegistry
): RenderGraphSnapshotEdgeReason {
	return {
		type: 'resource-hazard',
		hazard: reason.hazard,
		resourceKind: reason.resourceKind,
		physicalId: identities.get(reason.physicalId),
		readVersion: reason.reader.version,
		readerAlias: reason.reader.alias,
		readerLogicalId: logicalId(reason.reader.logicalId),
		...(reason.reader.subresource
			? { readerSubresource: copySubresource(reason.reader.subresource) }
			: {}),
		writerAlias: reason.writer.alias,
		writerLogicalId: logicalId(reason.writer.logicalId),
		...(reason.writer.subresource
			? { writerSubresource: copySubresource(reason.writer.subresource) }
			: {}),
		...(reason.textureOverlap ? { textureOverlap: copySubresource(reason.textureOverlap) } : {})
	};
}

function phaseFor(step: RenderGraphStep): RenderGraphSnapshotNode['phase'] {
	return step.kind === 'render' ? 'post-scene' : 'pre-scene';
}

function userLabel(step: RenderGraphStep): string | undefined {
	const label = (step.pass as { readonly label?: unknown }).label;
	return typeof label === 'string' && label.length > 0 ? label : undefined;
}

function fallbackLabel(step: RenderGraphStep): string {
	return `${step.kind}#${step.declarationIndex}`;
}

function snapshotPingPongReason(
	step: RenderGraphStep,
	identities: OpaqueIdentityRegistry
): RenderGraphSnapshotPingPongReason | undefined {
	const entries = step.resolvedResources?.entries ?? [];
	const read = entries.find(
		(entry) => entry.kind === 'sampled-texture' && entry.pingPong === 'read'
	);
	const write = entries.find(
		(entry) => entry.kind === 'storage-texture' && entry.pingPong === 'write'
	);
	if (
		!read ||
		!write ||
		!Object.is(read.logicalId, write.logicalId) ||
		!Object.is(read.physicalId, write.physicalId)
	) {
		return undefined;
	}

	return {
		type: 'resource-hazard',
		hazard: 'ping-pong',
		physicalId: identities.get(read.physicalId),
		readAlias: read.alias,
		writeAlias: write.alias
	};
}

function snapshotResources(
	plan: RenderGraphPlan,
	identities: OpaqueIdentityRegistry
): RenderGraphSnapshotResource[] {
	const resources = new Map<
		string,
		{
			id: string;
			physicalId: string;
			resourceKind: 'texture' | 'buffer';
			logicalIds: Set<string>;
		}
	>();
	for (const step of plan.steps) {
		for (const access of [
			...(step.resolvedResources?.reads ?? []),
			...(step.resolvedResources?.writes ?? [])
		]) {
			const id = identities.get(access.physicalId);
			const existing = resources.get(id);
			if (existing) {
				existing.logicalIds.add(logicalId(access.logicalId));
				continue;
			}
			resources.set(id, {
				id,
				physicalId: id,
				resourceKind: access.resourceKind,
				logicalIds: new Set([logicalId(access.logicalId)])
			});
		}
	}
	return [...resources.values()].map((resource) => ({
		...resource,
		logicalIds: [...resource.logicalIds]
	}));
}

/**
 * Creates a renderer-lifetime builder with weak object identity registries.
 *
 * @internal The plan cache assumes plans and their resolved accesses are immutable.
 * Renderer integration must create a new plan when a physical-access signature changes.
 */
export function createRenderGraphSnapshotBuilder(): RenderGraphSnapshotBuilder {
	const nodeIdentities = new OpaqueIdentityRegistry('node');
	const resourceIdentities = new OpaqueIdentityRegistry('resource');
	const cache = new WeakMap<RenderGraphPlan, RenderGraphSnapshot>();
	const baseSceneIdentity = {};
	const occurrenceIdentities = new WeakMap<object, Map<number, object>>();
	const nodeIdForStep = (step: RenderGraphStep): string => {
		const pass = step.pass as object;
		let identities = occurrenceIdentities.get(pass);
		if (!identities) {
			identities = new Map();
			occurrenceIdentities.set(pass, identities);
		}
		let identity = identities.get(step.declarationIndex);
		if (!identity) {
			identity = {};
			identities.set(step.declarationIndex, identity);
		}
		return nodeIdentities.get(identity);
	};

	return {
		empty: EMPTY_RENDER_GRAPH_SNAPSHOT,
		build(plan) {
			if (!plan) return EMPTY_RENDER_GRAPH_SNAPSHOT;
			const cached = cache.get(plan);
			if (cached) return cached;

			const executionSteps = [...plan.preSceneSteps, ...plan.renderSteps];
			const executionIndex = new Map<RenderGraphStep, number>();
			for (const [index, step] of plan.preSceneSteps.entries()) executionIndex.set(step, index);
			for (const [index, step] of plan.renderSteps.entries()) {
				executionIndex.set(step, plan.preSceneSteps.length + 1 + index);
			}

			const nodes: RenderGraphSnapshotNode[] = executionSteps.map((step) => {
				const label = userLabel(step);
				return {
					id: nodeIdForStep(step),
					kind: step.kind,
					phase: phaseFor(step),
					declarationIndex: step.declarationIndex,
					executionIndex: executionIndex.get(step)!,
					label: label ?? fallbackLabel(step),
					...(label ? { userLabel: label } : {}),
					input: step.input,
					output: step.output,
					resources: [
						...(step.resolvedResources?.reads ?? []),
						...(step.resolvedResources?.writes ?? [])
					].map((access) => snapshotResourceAccess(access, resourceIdentities))
				};
			});
			const baseSceneId = nodeIdentities.get(baseSceneIdentity);
			nodes.splice(plan.preSceneSteps.length, 0, {
				id: baseSceneId,
				kind: 'base-scene',
				phase: 'base-scene',
				declarationIndex: null,
				executionIndex: plan.preSceneSteps.length,
				label: 'base-scene#0',
				input: 'source',
				output: 'source',
				resources: []
			});

			const edgeMap = new Map<string, RenderGraphSnapshotEdge>();
			const addEdge = (from: string, to: string, reason: RenderGraphSnapshotEdgeReason): void => {
				if (from === to) return;
				const key = `${from}:${to}`;
				const existing = edgeMap.get(key);
				if (existing) {
					(existing.reasons as RenderGraphSnapshotEdgeReason[]).push(reason);
					return;
				}
				edgeMap.set(key, { from, to, reasons: [reason] });
			};
			for (const edge of plan.dependencyEdges) {
				for (const reason of edge.reasons) {
					addEdge(
						nodeIdForStep(edge.from),
						nodeIdForStep(edge.to),
						snapshotReason(reason, resourceIdentities)
					);
				}
			}
			for (const step of plan.preSceneSteps) {
				const nodeId = nodeIdForStep(step);
				addEdge(nodeId, baseSceneId, {
					type: 'phase-flow',
					hazard: 'phase-flow',
					transition: 'pre-scene-to-base-scene'
				});
				// Ping-pong advances state within one pass. Attach it to the existing
				// phase-flow edge so the snapshot explains the transition without a self-edge.
				const pingPongReason = snapshotPingPongReason(step, resourceIdentities);
				if (pingPongReason) addEdge(nodeId, baseSceneId, pingPongReason);
			}
			const firstRender = plan.renderSteps[0];
			if (firstRender) {
				addEdge(baseSceneId, nodeIdForStep(firstRender), {
					type: 'phase-flow',
					hazard: 'phase-flow',
					transition: 'base-scene-to-post-scene'
				});
			}
			const slotWriters = new Map<RenderPassInputSlot | RenderPassOutputSlot, string>([
				['source', baseSceneId]
			]);
			for (const step of plan.renderSteps) {
				const nodeId = nodeIdForStep(step);
				const inputWriter = slotWriters.get(step.input);
				if (inputWriter) {
					addEdge(inputWriter, nodeId, {
						type: 'slot-flow',
						hazard: 'slot-flow',
						slot: step.input
					});
				}
				if (step.needsSwap) {
					const previousSource = slotWriters.get('source');
					slotWriters.set('source', nodeId);
					if (previousSource) slotWriters.set('target', previousSource);
				} else {
					slotWriters.set(step.output, nodeId);
				}
			}
			const edges = [...edgeMap.values()];
			const snapshot = deepFreeze({
				schemaVersion: 1 as const,
				nodes,
				resources: snapshotResources(plan, resourceIdentities),
				edges,
				finalOutput: plan.finalOutput
			});
			cache.set(plan, snapshot);
			return snapshot;
		}
	};
}
