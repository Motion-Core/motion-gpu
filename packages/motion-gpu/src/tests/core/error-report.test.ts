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
		expect(report.code).toBe('WEBGPU_UNAVAILABLE');
		expect(report.severity).toBe('fatal');
		expect(report.recoverable).toBe(false);
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
		expect(report.code).toBe('WGSL_COMPILATION_FAILED');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
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
				fragmentSource: ['fn frag(uv: vec2f) -> vec4f {', '\tlet x = uv.x;', '\tuv.x;', '}'].join(
					'\n'
				),
				includeSources: {},
				materialSource: { component: 'GlassPaneScene.svelte' }
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.message).toBe(
			'[fragment line 3 | generated WGSL line 112] missing return at end of function'
		);
		expect(report.source).not.toBeNull();
		expect(report.source?.location).toContain('GlassPaneScene.svelte');
		expect(report.source?.location).toContain('fragment line 3');
		expect(report.source?.line).toBe(3);
		expect(report.source?.snippet.some((line) => line.highlight && line.number === 3)).toBe(true);
	});

	it('builds include source snippet when diagnostics point to include chunk', () => {
		const error = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nunknown function call'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 25,
						message: 'unknown function call',
						linePos: 4,
						lineLength: 8,
						sourceLocation: { kind: 'include', include: 'tone', line: 2 }
					}
				],
				fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				includeSources: {
					tone: ['fn tone(uv: vec2f) -> vec3f {', '\treturn vec3f(uv, 1.0);', '}'].join('\n')
				},
				materialSource: null
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.message).toBe(
			'[include <tone> line 2 | generated WGSL line 25] unknown function call'
		);
		expect(report.source?.component).toBe('#include <tone>');
		expect(report.source?.location).toContain('include <tone> line 2');
		expect(report.source?.line).toBe(2);
		expect(report.source?.snippet.some((line) => line.highlight && line.number === 2)).toBe(true);
	});

	it('builds define source snippet when diagnostics point to define block', () => {
		const error = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\ninvalid const literal'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 2,
						message: 'invalid const literal',
						linePos: 3,
						lineLength: 5,
						sourceLocation: { kind: 'define', define: 'USE_GLOW', line: 2 }
					}
				],
				fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				includeSources: {},
				defineBlockSource: ['const ENABLE_FX: bool = true;', 'const USE_GLOW: f32 = bad;'].join(
					'\n'
				),
				materialSource: null
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.message).toBe(
			'[define "USE_GLOW" line 2 | generated WGSL line 2] invalid const literal'
		);
		expect(report.source?.component).toBe('#define USE_GLOW');
		expect(report.source?.location).toContain('define "USE_GLOW" line 2');
		expect(report.source?.line).toBe(2);
		expect(report.source?.snippet.some((line) => line.highlight && line.number === 2)).toBe(true);
	});

	it('uses material source filename when component name is unavailable', () => {
		const error = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nbad expression'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 10,
						message: 'bad expression',
						sourceLocation: { kind: 'fragment', line: 1 }
					}
				],
				fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				includeSources: {},
				materialSource: { file: '/app/components/Water.svelte' }
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.source?.component).toBe('Water.svelte');
		expect(report.source?.location).toContain('Water.svelte');
	});

	it('classifies device lost errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('WebGPU device lost: The device was lost (unknown)'),
			'render'
		);

		expect(report.title).toBe('WebGPU device lost');
		expect(report.code).toBe('WEBGPU_DEVICE_LOST');
		expect(report.severity).toBe('fatal');
		expect(report.recoverable).toBe(false);
		expect(report.hint).toContain('Recreate the renderer');
	});

	it('classifies uncaptured GPU errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('WebGPU uncaptured error: validation failed'),
			'render'
		);

		expect(report.title).toBe('WebGPU uncaptured error');
		expect(report.code).toBe('WEBGPU_UNCAPTURED_ERROR');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
		expect(report.hint).toContain('GPU command failed asynchronously');
	});

	it('classifies adapter unavailable errors', () => {
		const report = toMotionGPUErrorReport(new Error('Unable to acquire WebGPU adapter'), 'render');
		expect(report.title).toBe('WebGPU adapter unavailable');
		expect(report.code).toBe('WEBGPU_ADAPTER_UNAVAILABLE');
		expect(report.severity).toBe('fatal');
		expect(report.recoverable).toBe(false);
		expect(report.hint).toContain('adapter request failed');
	});

	it('classifies canvas context errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('Canvas does not support webgpu context'),
			'initialization'
		);
		expect(report.title).toBe('Canvas cannot create WebGPU context');
		expect(report.code).toBe('WEBGPU_CONTEXT_UNAVAILABLE');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
		expect(report.hint).toContain('canvas is attached to DOM');
	});

	it('classifies copy-destination texture usage errors', () => {
		const report = toMotionGPUErrorReport(
			new Error('Destination texture needs to have CopyDst usage'),
			'render'
		);
		expect(report.title).toBe('Invalid texture usage flags');
		expect(report.code).toBe('TEXTURE_USAGE_INVALID');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
		expect(report.hint).toContain('must include CopyDst');
	});

	it('classifies bind group mismatch errors and removes duplicate stack message line', () => {
		const error = new Error('CreateBindGroup failed due to bind group layout mismatch');
		error.stack = [
			'Error: CreateBindGroup failed due to bind group layout mismatch',
			'CreateBindGroup failed due to bind group layout mismatch',
			'at render (Renderer.ts:42:7)'
		].join('\n');

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.title).toBe('Bind group mismatch');
		expect(report.code).toBe('BIND_GROUP_MISMATCH');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
		expect(report.stack).toEqual([
			'Error: CreateBindGroup failed due to bind group layout mismatch',
			'at render (Renderer.ts:42:7)'
		]);
	});

	it('handles unknown non-error values', () => {
		const report = toMotionGPUErrorReport({ broken: true }, 'render');
		expect(report.title).toBe('MotionGPU render error');
		expect(report.code).toBe('MOTIONGPU_RUNTIME_ERROR');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
		expect(report.message).toBe('Unknown FragCanvas error');
		expect(report.phase).toBe('render');
	});
});
