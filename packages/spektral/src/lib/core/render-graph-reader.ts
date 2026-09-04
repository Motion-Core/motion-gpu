import { EMPTY_RENDER_GRAPH_SNAPSHOT, type RenderGraphSnapshot } from './render-graph-snapshot.js';

/**
 * Read-only access to the current render graph snapshot.
 *
 * @experimental This diagnostic API may evolve before Spektral 1.0.
 */
export interface SpektralGraph {
	/**
	 * Returns the cached snapshot without rebuilding the graph or copying the result.
	 *
	 * @experimental This diagnostic API may evolve before Spektral 1.0.
	 */
	readonly getSnapshot: () => RenderGraphSnapshot;
}

/** @internal Renderer-facing side of the graph snapshot bridge. */
export interface SpektralGraphUpdater {
	setSnapshot(snapshot: RenderGraphSnapshot): void;
	reset(): void;
}

/** @internal Stable reader paired with a renderer-facing updater. */
export interface SpektralGraphBridge {
	readonly graph: SpektralGraph;
	readonly updater: SpektralGraphUpdater;
}

/**
 * Creates a stable graph reader. Renderer integration supplies already-frozen snapshots.
 *
 * @internal
 */
export function createSpektralGraphBridge(): SpektralGraphBridge {
	let current = EMPTY_RENDER_GRAPH_SNAPSHOT;
	const graph: SpektralGraph = Object.freeze({
		getSnapshot: () => current
	});
	const updater: SpektralGraphUpdater = Object.freeze({
		setSnapshot(snapshot: RenderGraphSnapshot) {
			current = snapshot;
		},
		reset() {
			current = EMPTY_RENDER_GRAPH_SNAPSHOT;
		}
	});

	return Object.freeze({ graph, updater });
}
