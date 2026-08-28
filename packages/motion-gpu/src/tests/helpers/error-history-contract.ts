import { describe, expect, it, vi } from 'vitest';
import type { MotionGPUErrorReport } from '../../lib/core/error-report.js';

export type ErrorHistoryMutationMode = 'invalid-texture' | 'invalid-uniform';

export interface ErrorHistoryContractHarness {
	emitError: (mode: ErrorHistoryMutationMode) => Promise<void>;
	unmount: () => Promise<void> | void;
	updateLimit: (limit: number) => Promise<void>;
}

export type MountErrorHistoryContract = (input: {
	historyLimit: number;
	onErrorHistory: (history: MotionGPUErrorReport[]) => void;
}) => Promise<ErrorHistoryContractHarness>;

function getLatestHistory(
	callback: ReturnType<typeof vi.fn<(history: MotionGPUErrorReport[]) => void>>
): MotionGPUErrorReport[] {
	const history = callback.mock.calls[callback.mock.calls.length - 1]?.[0];
	if (!history) {
		throw new Error('Expected an error history callback payload');
	}

	return history;
}

/**
 * Registers the error-history ownership contract shared by all framework adapters.
 */
export function runErrorHistoryContract(framework: string, mount: MountErrorHistoryContract): void {
	describe(`${framework} error history contract`, () => {
		it('publishes exactly once for additions, shrink and zero transitions', async () => {
			const onErrorHistory = vi.fn<(history: MotionGPUErrorReport[]) => void>();
			const harness = await mount({ historyLimit: 3, onErrorHistory });

			await harness.emitError('invalid-uniform');
			expect(onErrorHistory).toHaveBeenCalledTimes(1);
			expect(getLatestHistory(onErrorHistory)).toHaveLength(1);

			await harness.emitError('invalid-texture');
			expect(onErrorHistory).toHaveBeenCalledTimes(2);
			expect(getLatestHistory(onErrorHistory)).toHaveLength(2);

			await harness.updateLimit(1);
			expect(onErrorHistory).toHaveBeenCalledTimes(3);
			expect(getLatestHistory(onErrorHistory)).toHaveLength(1);
			expect(getLatestHistory(onErrorHistory)[0]?.rawMessage).toContain(
				'Unknown texture "uMissing"'
			);

			await harness.updateLimit(1.5);
			expect(onErrorHistory).toHaveBeenCalledTimes(3);

			await harness.updateLimit(0);
			expect(onErrorHistory).toHaveBeenCalledTimes(4);
			expect(getLatestHistory(onErrorHistory)).toEqual([]);

			await harness.updateLimit(0);
			expect(onErrorHistory).toHaveBeenCalledTimes(4);
			await harness.unmount();
			expect(onErrorHistory).toHaveBeenCalledTimes(4);
		});

		it('isolates callback snapshots from the runtime-owned history', async () => {
			const observedLengths: number[] = [];
			const snapshots: MotionGPUErrorReport[][] = [];
			const onErrorHistory = vi.fn((history: MotionGPUErrorReport[]) => {
				observedLengths.push(history.length);
				snapshots.push(history);
				history.length = 0;
			});
			const harness = await mount({ historyLimit: 3, onErrorHistory });

			await harness.emitError('invalid-uniform');
			await harness.emitError('invalid-texture');

			expect(observedLengths).toEqual([1, 2]);
			expect(snapshots[0]).not.toBe(snapshots[1]);
			expect(snapshots).toEqual([[], []]);
			await harness.unmount();
			expect(onErrorHistory).toHaveBeenCalledTimes(2);
		});

		it('keeps history disabled at zero and does not restore missed errors', async () => {
			const onErrorHistory = vi.fn<(history: MotionGPUErrorReport[]) => void>();
			const harness = await mount({ historyLimit: 0, onErrorHistory });

			await harness.emitError('invalid-uniform');
			expect(onErrorHistory).not.toHaveBeenCalled();

			await harness.updateLimit(2);
			expect(onErrorHistory).not.toHaveBeenCalled();

			await harness.emitError('invalid-texture');
			expect(onErrorHistory).toHaveBeenCalledTimes(1);
			expect(getLatestHistory(onErrorHistory)).toHaveLength(1);
			expect(getLatestHistory(onErrorHistory)[0]?.rawMessage).toContain(
				'Unknown texture "uMissing"'
			);

			await harness.updateLimit(0);
			expect(onErrorHistory).toHaveBeenCalledTimes(2);
			expect(getLatestHistory(onErrorHistory)).toEqual([]);
			await harness.unmount();
		});
	});
}
