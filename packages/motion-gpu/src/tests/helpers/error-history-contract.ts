import { describe, expect, it, vi } from 'vitest';
import type { MotionGPUErrorReport } from '../../lib/core/error-report.js';

export type ErrorHistoryMutationMode = 'invalid-texture' | 'invalid-uniform';
type ErrorHistory = readonly MotionGPUErrorReport[];

export interface ErrorHistoryContractHarness {
	emitError: (mode: ErrorHistoryMutationMode) => Promise<void>;
	unmount: () => Promise<void> | void;
	updateLimit: (limit: number) => Promise<void>;
}

export type MountErrorHistoryContract = (input: {
	historyLimit: number;
	onErrorHistory: (history: ErrorHistory) => void;
}) => Promise<ErrorHistoryContractHarness>;

function getLatestHistory(
	callback: ReturnType<typeof vi.fn<(history: ErrorHistory) => void>>
): ErrorHistory {
	const history = callback.mock.calls[callback.mock.calls.length - 1]?.[0];
	if (!history) {
		throw new Error('Expected an error history callback payload');
	}

	return history;
}

function expectFrozenReport(report: MotionGPUErrorReport): void {
	expect(Object.isFrozen(report)).toBe(true);
	expect(Object.isFrozen(report.details)).toBe(true);
	expect(Object.isFrozen(report.stack)).toBe(true);
	if (report.source) {
		expect(Object.isFrozen(report.source)).toBe(true);
		expect(Object.isFrozen(report.source.snippet)).toBe(true);
		expect(report.source.snippet.every((line) => Object.isFrozen(line))).toBe(true);
	}
	if (report.context) {
		expect(Object.isFrozen(report.context)).toBe(true);
		expect(Object.isFrozen(report.context.activeRenderTargets)).toBe(true);
		if (report.context.passGraph) {
			expect(Object.isFrozen(report.context.passGraph)).toBe(true);
			expect(Object.isFrozen(report.context.passGraph.inputs)).toBe(true);
			expect(Object.isFrozen(report.context.passGraph.outputs)).toBe(true);
		}
	}
}

/**
 * Registers the error-history ownership contract shared by all framework adapters.
 */
export function runErrorHistoryContract(framework: string, mount: MountErrorHistoryContract): void {
	describe(`${framework} error history contract`, () => {
		it('publishes exactly once for additions, shrink and zero transitions', async () => {
			const onErrorHistory = vi.fn<(history: ErrorHistory) => void>();
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

		it('publishes immutable snapshots without contaminating the next callback', async () => {
			const observedLengths: number[] = [];
			const snapshots: ErrorHistory[] = [];
			const onErrorHistory = vi.fn((history: ErrorHistory) => {
				observedLengths.push(history.length);
				snapshots.push(history);
				expect(Object.isFrozen(history)).toBe(true);
				for (const report of history) {
					expectFrozenReport(report);
				}
				if (snapshots.length === 1) {
					const firstReport = history[0];
					expect(firstReport).toBeDefined();
					expect(Reflect.set(history, 0, null)).toBe(false);
					expect(Reflect.set(firstReport ?? {}, 'message', 'contaminated')).toBe(false);
					expect(Reflect.set(firstReport?.details ?? [], 0, 'contaminated')).toBe(false);
				}
			});
			const harness = await mount({ historyLimit: 3, onErrorHistory });

			await harness.emitError('invalid-uniform');
			await harness.emitError('invalid-texture');

			expect(observedLengths).toEqual([1, 2]);
			expect(snapshots[0]).not.toBe(snapshots[1]);
			expect(snapshots[0]).toHaveLength(1);
			expect(snapshots[1]).toHaveLength(2);
			expect(snapshots[1]?.[0]?.message).not.toBe('contaminated');
			await harness.unmount();
			expect(onErrorHistory).toHaveBeenCalledTimes(2);
		});

		it('keeps history disabled at zero and does not restore missed errors', async () => {
			const onErrorHistory = vi.fn<(history: ErrorHistory) => void>();
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
