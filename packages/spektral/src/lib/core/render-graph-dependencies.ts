import type {
	ResolvedComputeAccess,
	ResolvedComputePassResources,
	ResolvedTextureSubresourceRange
} from './compute-resources.js';

export interface ComputeDependencyNode<TNode> {
	readonly value: TNode;
	readonly label: string;
	readonly resources?: ResolvedComputePassResources;
}

export interface ComputeDependencyReason {
	readonly hazard: 'RAW' | 'WAR';
	readonly resourceKind: ResolvedComputeAccess['resourceKind'];
	readonly physicalId: ResolvedComputeAccess['physicalId'];
	readonly reader: ResolvedComputeAccess;
	readonly writer: ResolvedComputeAccess;
	readonly textureOverlap?: ResolvedTextureSubresourceRange;
}

export interface ComputeDependencyEdge<TNode> {
	readonly from: TNode;
	readonly to: TNode;
	readonly reasons: readonly ComputeDependencyReason[];
}

export interface ComputeWriteConflictReason {
	readonly hazard: 'WAW';
	readonly resourceKind: ResolvedComputeAccess['resourceKind'];
	readonly physicalId: ResolvedComputeAccess['physicalId'];
	readonly firstWriter: ResolvedComputeAccess;
	readonly secondWriter: ResolvedComputeAccess;
	readonly textureOverlap?: ResolvedTextureSubresourceRange;
}

export interface ComputeMultipleWriterDiagnostic<TNode> {
	readonly kind: 'multiple-writers';
	readonly firstNode: TNode;
	readonly secondNode: TNode;
	readonly firstLabel: string;
	readonly secondLabel: string;
	readonly firstAccess: ResolvedComputeAccess;
	readonly secondAccess: ResolvedComputeAccess;
	readonly reason: ComputeWriteConflictReason;
}

export interface ComputeCycleDiagnostic<TNode> {
	readonly kind: 'cycle';
	readonly blockedNodes: readonly TNode[];
	readonly blockedLabels: readonly string[];
	readonly edges: readonly ComputeDependencyEdge<TNode>[];
}

export type ComputeDependencyDiagnostic<TNode> =
	| ComputeMultipleWriterDiagnostic<TNode>
	| ComputeCycleDiagnostic<TNode>;

export class ComputeDependencyAnalysisError<TNode> extends Error {
	readonly diagnostic: ComputeDependencyDiagnostic<TNode>;

	constructor(diagnostic: ComputeDependencyDiagnostic<TNode>) {
		super(
			diagnostic.kind === 'multiple-writers'
				? 'Compute graph has multiple writers.'
				: 'Compute dependency cycle detected.'
		);
		this.name = 'ComputeDependencyAnalysisError';
		this.diagnostic = diagnostic;
	}
}

export interface ComputeDependencyAnalysis<TNode> {
	readonly orderedNodes: readonly TNode[];
	readonly edges: readonly ComputeDependencyEdge<TNode>[];
}

interface IndexedWriter<TNode> {
	readonly index: number;
	readonly node: ComputeDependencyNode<TNode>;
	readonly access: ResolvedComputeAccess;
}

function rangesOverlap(
	leftBase: number,
	leftCount: number,
	rightBase: number,
	rightCount: number
): boolean {
	return leftBase < rightBase + rightCount && rightBase < leftBase + leftCount;
}

export function textureSubresourcesOverlap(
	left: ResolvedComputeAccess,
	right: ResolvedComputeAccess
): boolean {
	if (left.resourceKind !== 'texture' || right.resourceKind !== 'texture') return true;
	if (!left.subresource || !right.subresource) return true;
	return (
		rangesOverlap(
			left.subresource.baseMipLevel,
			left.subresource.mipLevelCount,
			right.subresource.baseMipLevel,
			right.subresource.mipLevelCount
		) &&
		rangesOverlap(
			left.subresource.baseArrayLayer,
			left.subresource.arrayLayerCount,
			right.subresource.baseArrayLayer,
			right.subresource.arrayLayerCount
		)
	);
}

function intersectTextureSubresources(
	left: ResolvedComputeAccess,
	right: ResolvedComputeAccess
): ResolvedTextureSubresourceRange | undefined {
	if (
		left.resourceKind !== 'texture' ||
		right.resourceKind !== 'texture' ||
		!left.subresource ||
		!right.subresource
	) {
		return undefined;
	}
	const baseMipLevel = Math.max(left.subresource.baseMipLevel, right.subresource.baseMipLevel);
	const mipEnd = Math.min(
		left.subresource.baseMipLevel + left.subresource.mipLevelCount,
		right.subresource.baseMipLevel + right.subresource.mipLevelCount
	);
	const baseArrayLayer = Math.max(
		left.subresource.baseArrayLayer,
		right.subresource.baseArrayLayer
	);
	const layerEnd = Math.min(
		left.subresource.baseArrayLayer + left.subresource.arrayLayerCount,
		right.subresource.baseArrayLayer + right.subresource.arrayLayerCount
	);
	return {
		baseMipLevel,
		mipLevelCount: mipEnd - baseMipLevel,
		baseArrayLayer,
		arrayLayerCount: (layerEnd - baseArrayLayer) as 1
	};
}

function accessesSharePhysicalResource(
	left: ResolvedComputeAccess,
	right: ResolvedComputeAccess
): boolean {
	return (
		left.resourceKind === right.resourceKind &&
		(Object.is(left.physicalId, right.physicalId) ||
			(left.source === 'external' &&
				right.source === 'external' &&
				Object.is(left.logicalId, right.logicalId)))
	);
}

/** Analyzes one contiguous compute segment without retaining renderer state. */
export function analyzeComputeDependencies<TNode>(
	nodes: readonly ComputeDependencyNode<TNode>[]
): ComputeDependencyAnalysis<TNode> {
	const writers: IndexedWriter<TNode>[] = [];

	for (let index = 0; index < nodes.length; index += 1) {
		const node = nodes[index];
		if (!node?.resources) continue;
		for (const access of node.resources.writes) {
			const previous = writers.find(
				(writer) =>
					writer.index !== index &&
					accessesSharePhysicalResource(writer.access, access) &&
					textureSubresourcesOverlap(writer.access, access)
			);
			if (previous) {
				const textureOverlap = intersectTextureSubresources(previous.access, access);
				throw new ComputeDependencyAnalysisError<TNode>({
					kind: 'multiple-writers',
					firstNode: previous.node.value,
					secondNode: node.value,
					firstLabel: previous.node.label,
					secondLabel: node.label,
					firstAccess: previous.access,
					secondAccess: access,
					reason: {
						hazard: 'WAW',
						resourceKind: access.resourceKind,
						physicalId: access.physicalId,
						firstWriter: previous.access,
						secondWriter: access,
						...(textureOverlap ? { textureOverlap } : {})
					}
				});
			}
			writers.push({ index, node, access });
		}
	}

	interface IndexedEdge {
		from: number;
		to: number;
		reasons: ComputeDependencyReason[];
	}
	const indexedEdges = new Map<string, IndexedEdge>();
	const addReason = (
		from: number,
		to: number,
		reader: ResolvedComputeAccess,
		writer: ResolvedComputeAccess
	): void => {
		if (from === to) return;
		const key = `${from}:${to}`;
		let edge = indexedEdges.get(key);
		if (!edge) {
			edge = { from, to, reasons: [] };
			indexedEdges.set(key, edge);
		}
		const textureOverlap = intersectTextureSubresources(reader, writer);
		edge.reasons.push({
			hazard: reader.version === 'initial' ? 'WAR' : 'RAW',
			resourceKind: reader.resourceKind,
			physicalId: reader.physicalId,
			reader,
			writer,
			...(textureOverlap ? { textureOverlap } : {})
		});
	};

	for (let readerIndex = 0; readerIndex < nodes.length; readerIndex += 1) {
		const resources = nodes[readerIndex]?.resources;
		if (!resources) continue;
		for (const reader of resources.reads) {
			for (const writer of writers) {
				if (!accessesSharePhysicalResource(writer.access, reader)) continue;
				if (!textureSubresourcesOverlap(writer.access, reader)) continue;
				if (reader.version === 'initial') {
					addReason(readerIndex, writer.index, reader, writer.access);
				} else {
					addReason(writer.index, readerIndex, reader, writer.access);
				}
			}
		}
	}

	const outgoing = Array.from({ length: nodes.length }, () => [] as IndexedEdge[]);
	const indegree = new Array<number>(nodes.length).fill(0);
	for (const edge of indexedEdges.values()) {
		outgoing[edge.from]?.push(edge);
		indegree[edge.to] = (indegree[edge.to] ?? 0) + 1;
	}

	const ready: number[] = [];
	for (let index = 0; index < nodes.length; index += 1) {
		if (indegree[index] === 0) ready.push(index);
	}
	const orderedNodes: TNode[] = [];
	while (ready.length > 0) {
		ready.sort((left, right) => left - right);
		const index = ready.shift();
		if (index === undefined) break;
		const node = nodes[index];
		if (node) orderedNodes.push(node.value);
		for (const edge of outgoing[index] ?? []) {
			indegree[edge.to] = (indegree[edge.to] ?? 0) - 1;
			if (indegree[edge.to] === 0) ready.push(edge.to);
		}
	}

	const toDependencyEdge = (edge: IndexedEdge): ComputeDependencyEdge<TNode> => ({
		from: nodes[edge.from]!.value,
		to: nodes[edge.to]!.value,
		reasons: edge.reasons
	});
	const edges: ComputeDependencyEdge<TNode>[] = [...indexedEdges.values()].map(toDependencyEdge);
	if (orderedNodes.length !== nodes.length) {
		// Kahn's remaining indegree also includes nodes merely downstream from a
		// cycle. Tarjan SCCs isolate only the declarations that participate in a
		// real cycle, so diagnostics never blame downstream work.
		const discovery = new Array<number>(nodes.length).fill(-1);
		const lowLink = new Array<number>(nodes.length).fill(-1);
		const onStack = new Array<boolean>(nodes.length).fill(false);
		const stack: number[] = [];
		const cyclicComponents: number[][] = [];
		let nextDiscovery = 0;
		const visit = (index: number): void => {
			discovery[index] = nextDiscovery;
			lowLink[index] = nextDiscovery;
			nextDiscovery += 1;
			stack.push(index);
			onStack[index] = true;
			for (const edge of outgoing[index] ?? []) {
				if (discovery[edge.to] === -1) {
					visit(edge.to);
					lowLink[index] = Math.min(lowLink[index]!, lowLink[edge.to]!);
				} else if (onStack[edge.to]) {
					lowLink[index] = Math.min(lowLink[index]!, discovery[edge.to]!);
				}
			}
			if (lowLink[index] !== discovery[index]) return;
			const component: number[] = [];
			let member: number | undefined;
			do {
				member = stack.pop();
				if (member === undefined) break;
				onStack[member] = false;
				component.push(member);
			} while (member !== index);
			const hasSelfLoop =
				component.length === 1 &&
				(outgoing[component[0]!] ?? []).some((edge) => edge.to === component[0]);
			if (component.length > 1 || hasSelfLoop) {
				component.sort((left, right) => left - right);
				cyclicComponents.push(component);
			}
		};
		for (let index = 0; index < nodes.length; index += 1) {
			if (discovery[index] === -1) visit(index);
		}
		cyclicComponents.sort((left, right) => left[0]! - right[0]!);
		const blockedIndices = cyclicComponents.flat().sort((left, right) => left - right);
		const componentByIndex = new Map<number, number>();
		for (const [componentIndex, component] of cyclicComponents.entries()) {
			for (const index of component) componentByIndex.set(index, componentIndex);
		}
		throw new ComputeDependencyAnalysisError<TNode>({
			kind: 'cycle',
			blockedNodes: blockedIndices.map((index) => nodes[index]!.value),
			blockedLabels: blockedIndices.map((index) => nodes[index]!.label),
			edges: [...indexedEdges.values()]
				.filter(
					(edge) =>
						componentByIndex.has(edge.from) &&
						componentByIndex.get(edge.from) === componentByIndex.get(edge.to)
				)
				.map(toDependencyEdge)
		});
	}

	return { orderedNodes, edges };
}
