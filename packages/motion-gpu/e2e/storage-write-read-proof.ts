import { defineMaterial } from '../src/lib/core/material.js';
import type { FrameState } from '../src/lib/core/types.js';

export interface StorageWriteReadProofResult {
	readonly values: readonly number[];
	readonly mutatedSourceValue: number;
}

export const storageWriteReadProofMaterial = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
	storageBuffers: {
		proof: {
			type: 'array<f32>',
			size: 4 * Float32Array.BYTES_PER_ELEMENT,
			access: 'read-write',
			initialData: new Float32Array([1, 2, 3, 4])
		}
	}
});

/**
 * Executes the storage snapshot/order proof synchronously until the GPU readback promise exists.
 */
export async function runStorageWriteReadProof(
	frame: Pick<FrameState, 'writeStorageBuffer' | 'readStorageBuffer'>
): Promise<StorageWriteReadProofResult> {
	const firstWrite = new Float32Array([10]);
	frame.writeStorageBuffer('proof', firstWrite, { offset: Float32Array.BYTES_PER_ELEMENT });
	firstWrite[0] = 999;

	const secondWrite = new Float32Array([20]);
	frame.writeStorageBuffer('proof', secondWrite, { offset: 2 * Float32Array.BYTES_PER_ELEMENT });
	const readback = frame.readStorageBuffer('proof');

	return {
		values: Array.from(new Float32Array(await readback)),
		mutatedSourceValue: firstWrite[0]
	};
}

export function formatStorageWriteReadProofError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
