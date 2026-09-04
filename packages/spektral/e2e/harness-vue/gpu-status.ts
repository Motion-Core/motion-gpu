export type GpuStatus = 'checking' | 'unavailable' | 'no-adapter' | 'ready';

export async function detectGpuStatus(): Promise<GpuStatus> {
	if (!navigator.gpu) {
		return 'unavailable';
	}

	try {
		const adapter = await navigator.gpu.requestAdapter();
		return adapter ? 'ready' : 'no-adapter';
	} catch {
		return 'no-adapter';
	}
}
