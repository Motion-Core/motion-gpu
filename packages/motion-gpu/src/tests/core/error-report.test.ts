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

	it('passes through shader runtime context metadata from diagnostics payload', () => {
		const error = attachShaderCompilationDiagnostics(
			new Error('WGSL compilation failed:\nunknown function call'),
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 14,
						message: 'unknown function call',
						sourceLocation: { kind: 'fragment', line: 1 }
					}
				],
				fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
				includeSources: {},
				materialSource: null,
				runtimeContext: {
					materialSignature: '{"fragment":"hash"}',
					passGraph: {
						passCount: 2,
						enabledPassCount: 1,
						inputs: ['source'],
						outputs: ['target']
					},
					activeRenderTargets: ['fxMain']
				}
			}
		);

		const report = toMotionGPUErrorReport(error, 'render');
		expect(report.context).toEqual({
			materialSignature: '{"fragment":"hash"}',
			passGraph: {
				passCount: 2,
				enabledPassCount: 1,
				inputs: ['source'],
				outputs: ['target']
			},
			activeRenderTargets: ['fxMain']
		});
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

	it('classifies texture request failures', () => {
		const report = toMotionGPUErrorReport(
			new Error('Texture request failed (404) for /missing-texture.png'),
			'initialization'
		);
		expect(report.title).toBe('Texture request failed');
		expect(report.code).toBe('TEXTURE_REQUEST_FAILED');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies missing createImageBitmap runtime support', () => {
		const report = toMotionGPUErrorReport(
			new Error('createImageBitmap is not available in this runtime'),
			'initialization'
		);
		expect(report.title).toBe('Texture decode unavailable');
		expect(report.code).toBe('TEXTURE_DECODE_UNAVAILABLE');
		expect(report.severity).toBe('fatal');
		expect(report.recoverable).toBe(false);
	});

	it('classifies aborted texture requests', () => {
		const report = toMotionGPUErrorReport(
			new Error('Texture request was aborted'),
			'initialization'
		);
		expect(report.title).toBe('Texture request aborted');
		expect(report.code).toBe('TEXTURE_REQUEST_ABORTED');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
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

	it('normalizes string-thrown values into report message and rawMessage', () => {
		const report = toMotionGPUErrorReport('raw string failure', 'render');
		expect(report.rawMessage).toBe('raw string failure');
		expect(report.message).toBe('raw string failure');
		expect(report.details).toEqual([]);
		expect(report.phase).toBe('render');
	});

	// --- Compute error tests ---

	it('classifies compute compilation errors with correct code', () => {
		const report = toMotionGPUErrorReport(
			new Error('Compute shader compilation failed: invalid entry point'),
			'render'
		);
		expect(report.title).toBe('Compute shader compilation failed');
		expect(report.code).toBe('COMPUTE_COMPILATION_FAILED');
		expect(report.severity).toBe('error');
		expect(report.hint).toContain('storage bindings');
	});

	it('compute compilation error is recoverable', () => {
		const report = toMotionGPUErrorReport(
			new Error('Compute shader compilation failed: bad workgroup_size'),
			'render'
		);
		expect(report.recoverable).toBe(true);
	});

	it('classifies material preprocess failures from unknown includes', () => {
		const report = toMotionGPUErrorReport(
			new Error('Unknown include "tone" referenced in fragment shader.'),
			'initialization'
		);

		expect(report.title).toBe('Material preprocess failed');
		expect(report.code).toBe('MATERIAL_PREPROCESS_FAILED');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies missing runtime bindings from unknown uniforms/textures/storage resources', () => {
		const report = toMotionGPUErrorReport(
			new Error('Unknown uniform "uGain". Declare it in material.uniforms first.'),
			'render'
		);

		expect(report.title).toBe('Runtime resource binding failed');
		expect(report.code).toBe('RUNTIME_RESOURCE_MISSING');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies storage buffer writes that exceed declared bounds', () => {
		const report = toMotionGPUErrorReport(
			new Error(
				'Storage buffer "particles" write out of bounds: offset=64, dataSize=256, bufferSize=128.'
			),
			'render'
		);

		expect(report.title).toBe('Storage buffer write out of bounds');
		expect(report.code).toBe('STORAGE_BUFFER_OUT_OF_BOUNDS');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies storage buffer read failures', () => {
		const report = toMotionGPUErrorReport(
			new Error('Cannot read storage buffer "particles": renderer not initialized.'),
			'render'
		);

		expect(report.title).toBe('Storage buffer read failed');
		expect(report.code).toBe('STORAGE_BUFFER_READ_FAILED');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies invalid render graph configurations', () => {
		const report = toMotionGPUErrorReport(
			new Error('Render pass #2 reads "target" before it is written.'),
			'initialization'
		);

		expect(report.title).toBe('Render graph configuration is invalid');
		expect(report.code).toBe('RENDER_GRAPH_INVALID');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies ping-pong pass misconfiguration', () => {
		const report = toMotionGPUErrorReport(
			new Error('PingPongComputePass must provide a target texture key.'),
			'render'
		);

		expect(report.title).toBe('Ping-pong compute pass is misconfigured');
		expect(report.code).toBe('PINGPONG_CONFIGURATION_INVALID');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies compute contract errors from invalid WGSL entrypoint requirements', () => {
		const report = toMotionGPUErrorReport(
			new Error('Compute shader must include a `@builtin(global_invocation_id)` parameter.'),
			'initialization'
		);

		expect(report.title).toBe('Compute contract is invalid');
		expect(report.code).toBe('COMPUTE_CONTRACT_INVALID');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});

	it('classifies invalid uniform value payloads', () => {
		const report = toMotionGPUErrorReport(
			new Error('Uniform vec3f value must be a tuple with 3 numbers'),
			'render'
		);

		expect(report.title).toBe('Uniform value is invalid');
		expect(report.code).toBe('UNIFORM_VALUE_INVALID');
		expect(report.severity).toBe('error');
		expect(report.recoverable).toBe(true);
	});
});
