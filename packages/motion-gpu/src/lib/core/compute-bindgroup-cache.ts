export interface ComputeBindGroupCacheRequest {
	topologyKey: string;
	layout: GPUBindGroupLayout;
	entries: readonly GPUBindGroupEntry[];
	resourceRefs: readonly unknown[];
}

export interface ComputeBindGroupCache {
	getOrCreate: (request: ComputeBindGroupCacheRequest) => GPUBindGroup | null;
	reset: () => void;
}

function equalResourceRefs(
	previous: readonly unknown[],
	previousCount: number,
	next: readonly unknown[]
): boolean {
	if (previousCount !== next.length) return false;
	for (let index = 0; index < previousCount; index += 1) {
		if (!Object.is(previous[index], next[index])) return false;
	}
	return true;
}

function nullBackingSlots(array: unknown[], from: number, to: number): void {
	for (let index = from; index < to; index += 1) array[index] = null;
}

/**
 * Pass-local cache for a pipeline-owned heterogeneous compute bind group layout.
 */
export function createComputeBindGroupCache(device: GPUDevice): ComputeBindGroupCache {
	let cachedTopologyKey: string | null = null;
	let cachedLayout: GPUBindGroupLayout | null = null;
	let cachedBindGroup: GPUBindGroup | null = null;
	let cachedResourceRefs: unknown[] = [];
	let cachedResourceRefCount = 0;

	const reset = (): void => {
		cachedTopologyKey = null;
		cachedLayout = null;
		cachedBindGroup = null;
		nullBackingSlots(cachedResourceRefs, 0, cachedResourceRefCount);
		cachedResourceRefCount = 0;
	};

	return {
		getOrCreate(request): GPUBindGroup | null {
			if (request.entries.length === 0) {
				reset();
				return null;
			}

			if (cachedTopologyKey !== request.topologyKey || cachedLayout !== request.layout) {
				cachedTopologyKey = request.topologyKey;
				cachedLayout = request.layout;
				cachedBindGroup = null;
				nullBackingSlots(cachedResourceRefs, 0, cachedResourceRefCount);
				cachedResourceRefCount = 0;
			}

			if (
				cachedBindGroup &&
				equalResourceRefs(cachedResourceRefs, cachedResourceRefCount, request.resourceRefs)
			) {
				return cachedBindGroup;
			}

			cachedBindGroup = device.createBindGroup({
				layout: request.layout,
				entries: request.entries
			});
			const previousCount = cachedResourceRefCount;
			cachedResourceRefCount = request.resourceRefs.length;
			if (cachedResourceRefs.length < cachedResourceRefCount) {
				cachedResourceRefs = new Array(cachedResourceRefCount);
			}
			for (let index = 0; index < cachedResourceRefCount; index += 1) {
				cachedResourceRefs[index] = request.resourceRefs[index];
			}
			nullBackingSlots(cachedResourceRefs, cachedResourceRefCount, previousCount);
			return cachedBindGroup;
		},
		reset
	};
}
