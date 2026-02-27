import { describe, expect, it } from 'vitest';
import { toFragkitErrorReport } from '../lib/core/error-report';

describe('error report', () => {
	it('classifies WebGPU unavailable errors', () => {
		const report = toFragkitErrorReport(
			new Error('WebGPU is not available in this browser'),
			'initialization'
		);

		expect(report.title).toBe('WebGPU unavailable');
		expect(report.hint).toContain('WebGPU enabled');
		expect(report.message).toBe('WebGPU is not available in this browser');
	});

	it('extracts WGSL details lines', () => {
		const report = toFragkitErrorReport(
			new Error(
				[
					'WGSL compilation failed:',
					'line 9: identifiers must not start with two or more underscores',
					"line 12: expected ';'"
				].join('\n')
			),
			'render'
		);

		expect(report.title).toBe('WGSL compilation failed');
		expect(report.details).toEqual([
			'line 9: identifiers must not start with two or more underscores',
			"line 12: expected ';'"
		]);
	});

	it('classifies device lost errors', () => {
		const report = toFragkitErrorReport(
			new Error('WebGPU device lost: The device was lost (unknown)'),
			'render'
		);

		expect(report.title).toBe('WebGPU device lost');
		expect(report.hint).toContain('Recreate the renderer');
	});

	it('classifies uncaptured GPU errors', () => {
		const report = toFragkitErrorReport(
			new Error('WebGPU uncaptured error: validation failed'),
			'render'
		);

		expect(report.title).toBe('WebGPU uncaptured error');
		expect(report.hint).toContain('GPU command failed asynchronously');
	});

	it('handles unknown non-error values', () => {
		const report = toFragkitErrorReport({ broken: true }, 'render');
		expect(report.title).toBe('Fragkit render error');
		expect(report.message).toBe('Unknown FragCanvas error');
		expect(report.phase).toBe('render');
	});
});
