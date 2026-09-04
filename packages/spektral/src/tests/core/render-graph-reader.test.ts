import { describe, expect, it } from 'vitest';
import { createSpektralGraphBridge } from '../../lib/core/render-graph-reader';
import { createRenderGraphSnapshotBuilder } from '../../lib/core/render-graph-snapshot';
import { planRenderGraph } from '../../lib/core/render-graph';

describe('render graph reader bridge', () => {
	it('shares one frozen empty snapshot before initialization and after reset', () => {
		const first = createSpektralGraphBridge();
		const second = createSpektralGraphBridge();
		const empty = first.graph.getSnapshot();

		expect(second.graph.getSnapshot()).toBe(empty);
		expect(empty).toEqual({
			schemaVersion: 1,
			nodes: [],
			resources: [],
			edges: [],
			finalOutput: 'canvas'
		});
		expect(Object.isFrozen(empty)).toBe(true);
		expect(Object.isFrozen(empty.nodes)).toBe(true);
		expect(Object.isFrozen(empty.resources)).toBe(true);
		expect(Object.isFrozen(empty.edges)).toBe(true);

		const populated = createRenderGraphSnapshotBuilder().build(planRenderGraph([], [0, 0, 0, 1]));
		first.updater.setSnapshot(populated);
		expect(first.graph.getSnapshot()).toBe(populated);
		expect(second.graph.getSnapshot()).toBe(empty);

		first.updater.reset();
		expect(first.graph.getSnapshot()).toBe(empty);
	});

	it('keeps the public reader stable and returns snapshots without copying', () => {
		const bridge = createSpektralGraphBridge();
		const graph = bridge.graph;
		const snapshot = createRenderGraphSnapshotBuilder().build(planRenderGraph([], [0, 0, 0, 1]));

		bridge.updater.setSnapshot(snapshot);
		expect(bridge.graph).toBe(graph);
		expect(graph.getSnapshot()).toBe(snapshot);
		expect(graph.getSnapshot()).toBe(snapshot);
		expect(Object.isFrozen(graph)).toBe(true);
		expect(Object.isFrozen(bridge.updater)).toBe(true);
		expect(Object.isFrozen(bridge)).toBe(true);
	});
});
