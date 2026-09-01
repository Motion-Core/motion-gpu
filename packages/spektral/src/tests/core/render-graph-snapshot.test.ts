import { describe, expect, it } from 'vitest';
import type { ResolvedComputePassResources } from '../../lib/core/compute-resources';
import { planRenderGraph } from '../../lib/core/render-graph';
import {
	createRenderGraphSnapshotBuilder,
	type RenderGraphSnapshot,
	type RenderGraphSnapshotEdgeReason
} from '../../lib/core/render-graph-snapshot';
import type { AnyPass, RenderPass } from '../../lib/core/types';
import { createManagedComputePass, createManagedFeedbackPass } from '../helpers/managed-pass';

function resources(
	physicalIds: readonly object[],
	mode: 'read' | 'write'
): ResolvedComputePassResources {
	const accesses = physicalIds.map((physicalId, index) => ({
		alias: `${mode}${index}`,
		resourceKind: 'texture' as const,
		logicalId: `${mode}-logical-${index}`,
		physicalId,
		mode,
		version: 'current' as const,
		subresource: {
			baseMipLevel: index,
			mipLevelCount: 1,
			baseArrayLayer: 0,
			arrayLayerCount: 1 as const
		}
	}));
	return {
		entries: [],
		reads: mode === 'read' ? accesses : [],
		writes: mode === 'write' ? accesses : [],
		topologyKey: mode,
		bindingCount: accesses.length
	};
}

function renderPass(label?: string): RenderPass {
	return {
		...(label ? { label } : {}),
		needsSwap: false,
		output: 'canvas',
		render: () => {}
	};
}

function fixture() {
	const physicalIds = [{}, {}] as const;
	const reader = createManagedComputePass({ label: 'Read velocities' });
	const writer = createManagedComputePass();
	const feedback = createManagedFeedbackPass({ label: 'Feedback history' });
	const post = renderPass('Present result');
	const resourceMap = new Map<AnyPass, ResolvedComputePassResources>([
		[reader, resources(physicalIds, 'read')],
		[writer, resources(physicalIds, 'write')]
	]);
	const plan = planRenderGraph([reader, writer, feedback, post], [0, 0, 0, 1], undefined, {
		getResolvedResources: (pass) => resourceMap.get(pass),
		getPassLabel: (pass) => pass.label ?? 'Compute pass'
	});
	return { plan, reader, writer, feedback, post, physicalIds, resourceMap };
}

function expectDeeplyFrozen(value: unknown, seen = new Set<object>()): void {
	if (typeof value !== 'object' || value === null || seen.has(value)) return;
	seen.add(value);
	expect(Object.isFrozen(value)).toBe(true);
	for (const nested of Object.values(value)) expectDeeplyFrozen(nested, seen);
}

function expectNoForbiddenReferences(value: unknown, forbidden: ReadonlySet<object>): void {
	if (typeof value === 'function' || typeof value === 'symbol') {
		expect.fail(`Snapshot contains forbidden ${typeof value} value.`);
	}
	if (typeof value !== 'object' || value === null) return;
	expect(forbidden.has(value)).toBe(false);
	for (const nested of Object.values(value)) expectNoForbiddenReferences(nested, forbidden);
}

describe('render graph snapshot builder', () => {
	it('models WAW, ping-pong, slot and phase reasons without adding invalid WAW edges', () => {
		const reasons: RenderGraphSnapshotEdgeReason[] = [
			{
				type: 'resource-hazard',
				hazard: 'WAW',
				resourceKind: 'texture',
				physicalId: 'resource-1',
				firstWriterAlias: 'first',
				firstWriterLogicalId: 'state',
				secondWriterAlias: 'second',
				secondWriterLogicalId: 'state'
			},
			{
				type: 'resource-hazard',
				hazard: 'ping-pong',
				physicalId: 'resource-1',
				readAlias: 'previous',
				writeAlias: 'next'
			},
			{ type: 'slot-flow', hazard: 'slot-flow', slot: 'source' },
			{
				type: 'phase-flow',
				hazard: 'phase-flow',
				transition: 'pre-scene-to-base-scene'
			}
		];
		expect(reasons.map((reason) => reason.hazard)).toEqual([
			'WAW',
			'ping-pong',
			'slot-flow',
			'phase-flow'
		]);
	});

	it('builds schema v1 nodes in execution order with phases, labels, routing and final output', () => {
		const { plan } = fixture();
		const snapshot = createRenderGraphSnapshotBuilder().build(plan);

		expect(snapshot.schemaVersion).toBe(1);
		expect(snapshot.finalOutput).toBe('canvas');
		expect(snapshot.nodes.map((node) => [node.kind, node.phase, node.executionIndex])).toEqual([
			['compute', 'pre-scene', 0],
			['compute', 'pre-scene', 1],
			['feedback', 'pre-scene', 2],
			['base-scene', 'base-scene', 3],
			['render', 'post-scene', 4]
		]);
		expect(snapshot.nodes.map((node) => node.declarationIndex)).toEqual([1, 0, 2, null, 3]);
		expect(snapshot.nodes.map((node) => node.label)).toEqual([
			'compute#1',
			'Read velocities',
			'Feedback history',
			'base-scene#0',
			'Present result'
		]);
		expect(snapshot.nodes[4]).toMatchObject({ input: 'source', output: 'canvas' });
		const base = snapshot.nodes.find((node) => node.kind === 'base-scene')!;
		const render = snapshot.nodes.find((node) => node.kind === 'render')!;
		const baseToRender = snapshot.edges.find(
			(edge) => edge.from === base.id && edge.to === render.id
		);
		expect(baseToRender?.reasons).toEqual([
			{
				type: 'phase-flow',
				hazard: 'phase-flow',
				transition: 'base-scene-to-post-scene'
			},
			{ type: 'slot-flow', hazard: 'slot-flow', slot: 'source' }
		]);
		expect(
			snapshot.nodes
				.filter((node) => node.phase === 'pre-scene')
				.every((node) =>
					snapshot.edges.some(
						(edge) =>
							edge.from === node.id &&
							edge.to === base.id &&
							edge.reasons.some((reason) => reason.hazard === 'phase-flow')
					)
				)
		).toBe(true);
	});

	it('derives fallback labels from the actual declaration index, including skipped passes', () => {
		const disabled = createManagedComputePass({ enabled: false });
		const active = createManagedComputePass();
		const snapshot = createRenderGraphSnapshotBuilder().build(
			planRenderGraph([disabled, active], [0, 0, 0, 1])
		);
		expect(snapshot.nodes[0]).toMatchObject({
			kind: 'compute',
			declarationIndex: 1,
			label: 'compute#1'
		});
		expect(snapshot.nodes[1]).toMatchObject({
			kind: 'base-scene',
			declarationIndex: null
		});
	});

	it('assigns distinct stable node IDs to repeated declarations of one pass instance', () => {
		const shared = createManagedFeedbackPass({ label: 'Shared feedback' });
		const builder = createRenderGraphSnapshotBuilder();
		const first = builder.build(planRenderGraph([shared, shared], [0, 0, 0, 1]));
		const second = builder.build(planRenderGraph([shared, shared], [0, 0, 0, 1]));
		const firstFeedback = first.nodes.filter((node) => node.kind === 'feedback');
		const secondFeedback = second.nodes.filter((node) => node.kind === 'feedback');

		expect(firstFeedback).toHaveLength(2);
		expect(new Set(firstFeedback.map((node) => node.id)).size).toBe(2);
		expect(secondFeedback.map((node) => node.id)).toEqual(firstFeedback.map((node) => node.id));
		const base = first.nodes.find((node) => node.kind === 'base-scene')!;
		for (const node of firstFeedback) {
			expect(first.edges.some((edge) => edge.from === node.id && edge.to === base.id)).toBe(true);
		}
	});

	it('keeps multi-reason RAW edges and exposes only opaque shared physical IDs', () => {
		const { plan } = fixture();
		const snapshot = createRenderGraphSnapshotBuilder().build(plan);

		const resourceEdge = snapshot.edges.find((edge) =>
			edge.reasons.some((reason) => reason.hazard === 'RAW')
		);
		expect(resourceEdge?.reasons).toHaveLength(2);
		expect(resourceEdge?.reasons.map((reason) => reason.hazard)).toEqual(['RAW', 'RAW']);
		for (const reason of resourceEdge?.reasons ?? []) {
			if (
				reason.type !== 'resource-hazard' ||
				reason.hazard === 'WAW' ||
				reason.hazard === 'ping-pong'
			) {
				throw new Error('Expected a RAW/WAR resource reason.');
			}
			expect(reason.physicalId).toMatch(/^resource-\d+$/);
			expect(reason.readerLogicalId).toMatch(/^read-logical-/);
			expect(reason.readVersion).toBe('current');
			expect(reason.textureOverlap).toBeDefined();
		}
		const writerResources = snapshot.nodes[0]?.resources ?? [];
		const readerResources = snapshot.nodes[1]?.resources ?? [];
		expect(writerResources.map((resource) => resource.resourceId)).toEqual(
			readerResources.map((resource) => resource.resourceId)
		);
		expect(snapshot.resources).toHaveLength(2);
		expect(snapshot.resources.map((resource) => resource.id)).toEqual(
			writerResources.map((resource) => resource.resourceId)
		);
		expect(snapshot.resources.every((resource) => resource.id === resource.physicalId)).toBe(true);
		expect(snapshot.nodes.every((node) => /^node-\d+$/u.test(node.id))).toBe(true);
		expect(
			snapshot.resources.every(
				(resource) =>
					/^resource-\d+$/u.test(resource.id) &&
					!snapshot.nodes.some((node) => node.id === resource.id)
			)
		).toBe(true);
		expect(snapshot.resources.map((resource) => resource.logicalIds)).toEqual([
			['read-logical-0', 'write-logical-0'],
			['read-logical-1', 'write-logical-1']
		]);
	});

	it('connects post-scene nodes through their declared render slots', () => {
		const first = {
			label: 'Write FX',
			needsSwap: false,
			output: 'fx' as const,
			render: () => {}
		};
		const second = {
			label: 'Read FX',
			needsSwap: false,
			input: 'fx' as const,
			output: 'canvas' as const,
			render: () => {}
		};
		const plan = planRenderGraph([first, second], [0, 0, 0, 1], ['fx']);
		const snapshot = createRenderGraphSnapshotBuilder().build(plan);
		const firstNode = snapshot.nodes.find((node) => node.label === 'Write FX')!;
		const secondNode = snapshot.nodes.find((node) => node.label === 'Read FX')!;
		expect(
			snapshot.edges.find((edge) => edge.from === firstNode.id && edge.to === secondNode.id)
				?.reasons
		).toEqual([{ type: 'slot-flow', hazard: 'slot-flow', slot: 'fx' }]);
		expect(snapshot.finalOutput).toBe('canvas');
	});

	it('attaches a real ping-pong flow reason to the pre-scene-to-base edge', () => {
		const physicalId = {};
		const pingPong = createManagedComputePass();
		const resolvedResources = {
			entries: [
				{
					kind: 'sampled-texture',
					alias: 'previousState',
					logicalId: 'state',
					physicalId,
					pingPong: 'read'
				},
				{
					kind: 'storage-texture',
					alias: 'nextState',
					logicalId: 'state',
					physicalId,
					pingPong: 'write'
				}
			],
			reads: [
				{
					alias: 'previousState',
					resourceKind: 'texture',
					logicalId: 'state',
					physicalId,
					mode: 'read',
					version: 'current'
				}
			],
			writes: [
				{
					alias: 'nextState',
					resourceKind: 'texture',
					logicalId: 'state',
					physicalId,
					mode: 'write',
					version: 'current'
				}
			],
			topologyKey: 'ping-pong',
			bindingCount: 2
		} as unknown as ResolvedComputePassResources;
		const plan = planRenderGraph([pingPong], [0, 0, 0, 1], undefined, {
			getResolvedResources: () => resolvedResources
		});
		const snapshot = createRenderGraphSnapshotBuilder().build(plan);
		const computeNode = snapshot.nodes.find((node) => node.kind === 'compute')!;
		const baseNode = snapshot.nodes.find((node) => node.kind === 'base-scene')!;
		const flow = snapshot.edges.find(
			(edge) => edge.from === computeNode.id && edge.to === baseNode.id
		);

		expect(flow?.from).not.toBe(flow?.to);
		expect(flow?.reasons).toContainEqual({
			type: 'resource-hazard',
			hazard: 'ping-pong',
			physicalId: snapshot.resources[0]?.physicalId,
			readAlias: 'previousState',
			writeAlias: 'nextState'
		});
	});

	it('caches by plan identity, preserves node IDs across new plans, and never mutates old snapshots', () => {
		const { plan, reader, writer, feedback, post, resourceMap } = fixture();
		const builder = createRenderGraphSnapshotBuilder();
		const first = builder.build(plan);
		expect(builder.build(plan)).toBe(first);

		const nextPlan = planRenderGraph([reader, writer, feedback, post], [0, 0, 0, 1], undefined, {
			getResolvedResources: (pass) => resourceMap.get(pass),
			getPassLabel: (pass) => pass.label ?? 'Compute pass'
		});
		const second = builder.build(nextPlan);
		expect(second).not.toBe(first);
		expect(second.nodes.map((node) => node.id)).toEqual(first.nodes.map((node) => node.id));
		expect(first.nodes.map((node) => node.label)).toEqual([
			'compute#1',
			'Read velocities',
			'Feedback history',
			'base-scene#0',
			'Present result'
		]);
	});

	it('returns one deeply frozen empty snapshot before initialization and after teardown', () => {
		const builder = createRenderGraphSnapshotBuilder();
		const before = builder.build(undefined);
		const after = builder.build(null);
		expect(before).toBe(builder.empty);
		expect(after).toBe(before);
		expect(before).toEqual({
			schemaVersion: 1,
			nodes: [],
			resources: [],
			edges: [],
			finalOutput: 'canvas'
		});
		expectDeeplyFrozen(before);
	});

	it('returns a deeply frozen copy without pass, GPU, WGSL, callback, data or timing references', () => {
		const { plan, reader, writer, feedback, post, physicalIds } = fixture();
		const snapshot: RenderGraphSnapshot = createRenderGraphSnapshotBuilder().build(plan);
		expectDeeplyFrozen(snapshot);
		expectNoForbiddenReferences(
			snapshot,
			new Set<object>([reader, writer, feedback, post, ...physicalIds])
		);
		expect(() => {
			(snapshot.nodes as Array<unknown>).push({});
		}).toThrow();
		expect(() => {
			(snapshot.nodes[0] as { label: string }).label = 'mutated';
		}).toThrow();
		expect(JSON.stringify(snapshot)).not.toMatch(
			/@compute|workgroup_size|function|timing|callback/u
		);
	});
});
