import { describe, expect, it } from 'vitest';
import { findDirtyFloatRanges } from '../../lib/core/renderer';

describe('findDirtyFloatRanges', () => {
	it('returns empty array for identical buffers', () => {
		const a = new Float32Array([1, 2, 3, 4]);
		const b = new Float32Array([1, 2, 3, 4]);
		expect(findDirtyFloatRanges(a, b)).toEqual([]);
	});

	it('returns single range for one changed float', () => {
		const a = new Float32Array([0, 0, 0, 0]);
		const b = new Float32Array([0, 1, 0, 0]);
		expect(findDirtyFloatRanges(a, b)).toEqual([{ start: 1, count: 1 }]);
	});

	it('returns single range for contiguous dirty floats', () => {
		const a = new Float32Array([0, 0, 0, 0, 0, 0]);
		const b = new Float32Array([0, 1, 2, 3, 0, 0]);
		expect(findDirtyFloatRanges(a, b)).toEqual([{ start: 1, count: 3 }]);
	});

	it('returns single range when trailing floats are dirty', () => {
		const a = new Float32Array([0, 0, 0, 0]);
		const b = new Float32Array([0, 0, 1, 2]);
		expect(findDirtyFloatRanges(a, b)).toEqual([{ start: 2, count: 2 }]);
	});

	it('merges two dirty ranges separated by a small gap', () => {
		//                                  0  1  2  3  4  5  6  7
		const a = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);
		const b = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
		// index 0 dirty, index 4 dirty, gap = 3 (<= 4 threshold) → merge
		expect(findDirtyFloatRanges(a, b, 4)).toEqual([{ start: 0, count: 5 }]);
	});

	it('merges two dirty ranges with gap exactly at threshold', () => {
		//                                  0  1  2  3  4  5  6  7  8  9
		const a = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		const b = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
		// index 0 dirty, index 5 dirty, gap = 4 (== threshold) → merge
		expect(findDirtyFloatRanges(a, b)).toEqual([{ start: 0, count: 6 }]);
	});

	it('keeps separate ranges when gap exceeds threshold', () => {
		//                                  0  1  2  3  4  5  6  7  8  9
		const a = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		const b = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
		// index 0 dirty, index 6 dirty, gap = 5 (> 4 threshold) → separate
		expect(findDirtyFloatRanges(a, b, 4)).toEqual([
			{ start: 0, count: 1 },
			{ start: 6, count: 1 }
		]);
	});

	it('merges three close ranges into one', () => {
		const a = new Float32Array(16).fill(0);
		const b = new Float32Array(16).fill(0);
		b[0] = 1;
		b[4] = 1;
		b[8] = 1;
		// gaps of 3 between each → all merge
		expect(findDirtyFloatRanges(a, b)).toEqual([{ start: 0, count: 9 }]);
	});

	it('handles all-dirty buffer as single range', () => {
		const a = new Float32Array([0, 0, 0, 0]);
		const b = new Float32Array([1, 2, 3, 4]);
		expect(findDirtyFloatRanges(a, b)).toEqual([{ start: 0, count: 4 }]);
	});

	it('handles empty buffers', () => {
		const a = new Float32Array(0);
		const b = new Float32Array(0);
		expect(findDirtyFloatRanges(a, b)).toEqual([]);
	});
});
