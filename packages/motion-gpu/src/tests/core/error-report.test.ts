import { describe, expect, it } from 'vitest';
import { attachShaderCompilationDiagnostics } from '../../lib/core/error-diagnostics';
import { toMotionGPUErrorReport } from '../../lib/core/error-report';

describe('error report', () => {
	it('classifies WebGPU unavailable errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('WebGPU is not available in this browser'),
			'initialization'
		);

		expect(report.title).toBe('WebGPU unavailable');
		expect(report.hint).toContain('WebGPU enabled');
		expect(report.message).toBe('WebGPU is not available in this browser');
	});

	it('extracts WGSL details lines', () => {
		const report = toMotionGPUErrorReport(
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

	it('builds source snippet from structured shader diagnostics', () => {
		const error = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nmissing return at end of function'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 112,
						message: 'missing return at end of function',
						linePos: 5,
						lineLength: 6,
						sourceLocation: { kind: 'fragment', line: 3 }
					}
				],
				fragmentSource: ['fn frag(uv: vec2f) -> vec4f {', '\tlet x = uv.x;', '\tuv.x;', '}'].join('\n'),
				includeSources: {},
				materialSource: { component: 'GlassPaneScene.svelte' }
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.message).toBe('missing return at end of function');
		expect(report.source).not.toBeNull();
		expect(report.source?.location).toContain('GlassPaneScene.svelte');
		expect(report.source?.line).toBe(3);
		expect(report.source?.snippet.some((line) => line.highlight && line.number === 3)).toBe(true);
	});

	it('classifies device lost errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('WebGPU device lost: The device was lost (unknown)'),
			'render'
		);

		expect(report.title).toBe('WebGPU device lost');
		expect(report.hint).toContain('Recreate the renderer');
	});

	it('classifies uncaptured GPU errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('WebGPU uncaptured error: validation failed'),
			'render'
		);

		expect(report.title).toBe('WebGPU uncaptured error');
		expect(report.hint).toContain('GPU command failed asynchronously');
	});

	it('handles unknown non-error values', () => {
		const report = toMotionGPUErrorReport({ broken: true }, 'render');
		expect(report.title).toBe('MotionGPU render error');
		expect(report.message).toBe('Unknown FragCanvas error');
		expect(report.phase).toBe('render');
	});
});
