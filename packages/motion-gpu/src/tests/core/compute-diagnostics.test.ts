import { describe, expect, it } from 'vitest';
import {
	attachShaderCompilationDiagnostics,
	getShaderCompilationDiagnostics
} from '../../lib/core/error-diagnostics';
import { toMotionGPUErrorReport } from '../../lib/core/error-report';

describe('compute diagnostics', () => {
	it('attaches and extracts compute-stage diagnostics payload', () => {
		const error = attachShaderCompilationDiagnostics(new Error('compile failed'), {
			kind: 'shader-compilation',
			shaderStage: 'compute',
			diagnostics: [
				{
					generatedLine: 41,
					message: 'unknown symbol',
					linePos: 7,
					sourceLocation: { kind: 'compute', line: 3 }
				}
			],
			fragmentSource: '',
			computeSource: [
				'@compute @workgroup_size(8, 8, 1)',
				'fn compute(@builtin(global_invocation_id) id: vec3u) {',
				'\tlet v = BROKEN;',
				'}'
			].join('\n'),
			includeSources: {},
			materialSource: null,
			runtimeContext: {
				activeRenderTargets: ['fxMain'],
				passGraph: {
					passCount: 2,
					enabledPassCount: 2,
					inputs: ['source'],
					outputs: ['target']
				}
			}
		});

		const payload = getShaderCompilationDiagnostics(error);
		expect(payload).not.toBeNull();
		expect(payload?.shaderStage).toBe('compute');
		expect(payload?.computeSource).toContain('BROKEN');
		expect(payload?.diagnostics[0]?.sourceLocation).toEqual({ kind: 'compute', line: 3 });
	});

	it('maps compute diagnostics to report with compute source snippet', () => {
		const error = attachShaderCompilationDiagnostics(
			new Error('Compute shader compilation failed:\nunknown symbol BROKEN'),
			{
				kind: 'shader-compilation',
				shaderStage: 'compute',
				diagnostics: [
					{
						generatedLine: 27,
						message: 'unknown symbol BROKEN',
						linePos: 10,
						sourceLocation: { kind: 'compute', line: 4 }
					}
				],
				fragmentSource: '',
				computeSource: [
					'@compute @workgroup_size(64, 1, 1)',
					'fn compute(@builtin(global_invocation_id) id: vec3u) {',
					'\tlet idx = id.x;',
					'\tdata[idx] = BROKEN;',
					'}'
				].join('\n'),
				includeSources: {},
				materialSource: null,
				runtimeContext: {
					activeRenderTargets: ['fxMain'],
					passGraph: {
						passCount: 1,
						enabledPassCount: 1,
						inputs: ['source'],
						outputs: ['target']
					}
				}
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.code).toBe('COMPUTE_COMPILATION_FAILED');
		expect(report.title).toBe('Compute shader compilation failed');
		expect(report.message).toContain('compute line 4');
		expect(report.source?.component).toBe('Compute shader');
		expect(report.source?.line).toBe(4);
		expect(report.source?.snippet.some((line) => line.highlight && line.number === 4)).toBe(true);
		expect(report.context).toEqual({
			activeRenderTargets: ['fxMain'],
			passGraph: {
				passCount: 1,
				enabledPassCount: 1,
				inputs: ['source'],
				outputs: ['target']
			}
		});
	});

	it('measures compute error classification coverage at 100%', () => {
		const scenarios = [
			'Compute shader compilation failed: invalid entry point',
			'Compute shader compilation failed:\nunknown symbol',
			'Compute shader compilation failed:\ninvalid workgroup_size',
			'Compute shader compilation failed:\nstorage texture mismatch',
			'Compute shader compilation failed:\nwrite-only violation'
		];

		const reports = scenarios.map((message) =>
			toMotionGPUErrorReport(new Error(message), 'render')
		);
		const classified = reports.filter(
			(report) => report.code === 'COMPUTE_COMPILATION_FAILED'
		).length;
		const coverage = classified / scenarios.length;

		expect(coverage).toBe(1);
	});

	it('measures compute diagnostics completeness at 100%', () => {
		const makeReport = (line: number) => {
			const error = attachShaderCompilationDiagnostics(
				new Error('Compute shader compilation failed:\nunknown symbol'),
				{
					kind: 'shader-compilation',
					shaderStage: 'compute',
					diagnostics: [
						{
							generatedLine: 20 + line,
							message: 'unknown symbol',
							sourceLocation: { kind: 'compute', line }
						}
					],
					fragmentSource: '',
					computeSource: [
						'@compute @workgroup_size(8)',
						'fn compute(id: vec3u) {',
						'\tBROKEN;',
						'}'
					].join('\n'),
					includeSources: {},
					materialSource: null,
					runtimeContext: {
						activeRenderTargets: ['fxMain'],
						passGraph: {
							passCount: 1,
							enabledPassCount: 1,
							inputs: ['source'],
							outputs: ['target']
						}
					}
				}
			);
			return toMotionGPUErrorReport(error, 'render');
		};

		const reports = [makeReport(2), makeReport(3), makeReport(4)];
		const complete = reports.filter((report) => {
			return (
				report.code === 'COMPUTE_COMPILATION_FAILED' &&
				report.message.length > 0 &&
				report.hint.length > 0 &&
				Boolean(report.context) &&
				Boolean(report.source)
			);
		}).length;
		const completeness = complete / reports.length;

		expect(completeness).toBe(1);
	});
});
