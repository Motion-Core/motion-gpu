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

function equalResourceRefs(previous: readonly unknown[], next: readonly unknown[]): boolean {
	if (previous.length !== next.length) {
		return false;
	}

	for (let index = 0; index < previous.length; index += 1) {
		if (!Object.is(previous[index], next[index])) {
			return false;
		}
	}

	return true;
}

export function createComputeStorageBindGroupCache(
	device: GPUDevice
): ComputeStorageBindGroupCache {
	let cachedTopologyKey: string | null = null;
	let cachedLayout: GPUBindGroupLayout | null = null;
	let cachedBindGroup: GPUBindGroup | null = null;
	let cachedResourceRefs: readonly unknown[] = [];

	const reset = (): void => {
		cachedTopologyKey = null;
		cachedLayout = null;
		cachedBindGroup = null;
		cachedResourceRefs = [];
	};

	return {
		getOrCreate(request) {
			if (request.layoutEntries.length === 0) {
				reset();
				return null;
			}

			if (cachedTopologyKey !== request.topologyKey) {
				cachedTopologyKey = request.topologyKey;
				cachedLayout = device.createBindGroupLayout({ entries: request.layoutEntries });
				cachedBindGroup = null;
				cachedResourceRefs = [];
			}

			if (!cachedLayout) {
				throw new Error('Compute storage bind group cache is missing a layout.');
			}

			if (cachedBindGroup && equalResourceRefs(cachedResourceRefs, request.resourceRefs)) {
				return cachedBindGroup;
			}

			cachedBindGroup = device.createBindGroup({
				layout: cachedLayout,
				entries: request.bindGroupEntries
			});
			cachedResourceRefs = [...request.resourceRefs];
			return cachedBindGroup;
		},
		reset
	};
}
