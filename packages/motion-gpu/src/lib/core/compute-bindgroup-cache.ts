export interface ComputeStorageBindGroupCacheRequest {
	topologyKey: string;
	layoutEntries: GPUBindGroupLayoutEntry[];
	bindGroupEntries: GPUBindGroupEntry[];
	resourceRefs: readonly unknown[];
}

export interface ComputeStorageBindGroupCache {
	getOrCreate: (request: ComputeStorageBindGroupCacheRequest) => GPUBindGroup | null;
	reset: () => void;
}

function equalResourceRefs(
	previous: readonly unknown[],
	previousCount: number,
	next: readonly unknown[]
): boolean {
	if (previousCount !== next.length) {
		return false;
	}

	for (let index = 0; index < previousCount; index += 1) {
		if (!Object.is(previous[index], next[index])) {
			return false;
		}
	}

	return true;
}

function nullBackingSlots(array: unknown[], from: number, to: number): void {
	for (let index = from; index < to; index += 1) {
		array[index] = null;
	}
}

export function createComputeStorageBindGroupCache(
	device: GPUDevice
): ComputeStorageBindGroupCache {
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

	const cache = {
		getOrCreate(request: ComputeStorageBindGroupCacheRequest): GPUBindGroup | null {
			if (request.layoutEntries.length === 0) {
				reset();
				return null;
			}

			if (cachedTopologyKey !== request.topologyKey) {
				cachedTopologyKey = request.topologyKey;
				cachedLayout = device.createBindGroupLayout({ entries: request.layoutEntries });
				cachedBindGroup = null;
				nullBackingSlots(cachedResourceRefs, 0, cachedResourceRefCount);
				cachedResourceRefCount = 0;
			}

			if (!cachedLayout) {
				throw new Error('Compute storage bind group cache is missing a layout.');
			}

			if (
				cachedBindGroup &&
				equalResourceRefs(cachedResourceRefs, cachedResourceRefCount, request.resourceRefs)
			) {
				return cachedBindGroup;
			}

			cachedBindGroup = device.createBindGroup({
				layout: cachedLayout,
				entries: request.bindGroupEntries
			});
			const prevCount = cachedResourceRefCount;
			cachedResourceRefCount = request.resourceRefs.length;
			if (cachedResourceRefs.length < cachedResourceRefCount) {
				cachedResourceRefs = new Array(cachedResourceRefCount);
			}
			for (let index = 0; index < cachedResourceRefCount; index += 1) {
				cachedResourceRefs[index] = request.resourceRefs[index];
			}
			nullBackingSlots(cachedResourceRefs, cachedResourceRefCount, prevCount);
			return cachedBindGroup;
		},
		reset,
		_refAt(index: number): unknown {
			return cachedResourceRefs[index];
		}
	};

	return cache;
}
