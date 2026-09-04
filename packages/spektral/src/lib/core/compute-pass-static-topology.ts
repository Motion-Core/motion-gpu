import { normalizeComputeResourceMap } from './compute-resources.js';
import type { ComputeResourceMap } from './types.js';

export type ComputePassStaticTopologyKind = 'compute' | 'ping-pong-compute';

/** Pass-owned resource topology. Its identity is stable for the pass lifetime. */
export interface ComputePassStaticTopology {
	readonly kind: ComputePassStaticTopologyKind;
	readonly resources: ComputeResourceMap;
	readonly aliases: readonly string[];
}

export const computePassStaticTopology = Symbol('spektral.computePassStaticTopology');

export interface ComputePassStaticTopologyOwner {
	readonly [computePassStaticTopology]: ComputePassStaticTopology;
}

export interface ComputePassStaticTopologyEvent {
	readonly type: 'normalized' | 'allocated';
	readonly kind: ComputePassStaticTopologyKind;
	readonly topology?: ComputePassStaticTopology;
}

type StaticTopologyObserver = (event: ComputePassStaticTopologyEvent) => void;

let testObserver: StaticTopologyObserver | undefined;

/** Installs construction-only instrumentation for focused allocation tests. */
export function observeComputePassStaticTopologyForTests(
	observer: StaticTopologyObserver
): () => void {
	if (testObserver !== undefined) {
		throw new Error('Compute pass static topology instrumentation is already active.');
	}
	testObserver = observer;
	return () => {
		if (testObserver === observer) {
			testObserver = undefined;
		}
	};
}

export function createComputePassStaticTopology(
	kind: ComputePassStaticTopologyKind,
	resources: ComputeResourceMap | undefined,
	validate?: (normalizedResources: ComputeResourceMap) => void
): ComputePassStaticTopology {
	const normalizedResources = normalizeComputeResourceMap(resources);
	testObserver?.({ type: 'normalized', kind });
	validate?.(normalizedResources);
	const topology = Object.freeze({
		kind,
		resources: normalizedResources,
		aliases: Object.freeze(Object.keys(normalizedResources))
	});
	testObserver?.({ type: 'allocated', kind, topology });
	return topology;
}

/** Returns the pass-owned descriptor without copying its immutable topology. */
export function getComputePassStaticTopology(pass: object): ComputePassStaticTopology {
	const topology = (pass as Partial<ComputePassStaticTopologyOwner>)[computePassStaticTopology];
	if (topology === undefined) {
		throw new Error('Compute pass does not own a static topology descriptor.');
	}
	return topology;
}
