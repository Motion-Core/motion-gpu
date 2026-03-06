import { describe, expect, it } from 'vitest';
import {
	attachShaderCompilationDiagnostics,
	getShaderCompilationDiagnostics
} from '../../lib/core/error-diagnostics';

describe('error diagnostics', () => {
	it('attaches and extracts shader diagnostics payload', () => {
		const error = attachShaderCompilationDiagnostics(new Error('compile failed'), {
			kind: 'shader-compilation',
			diagnostics: [
				{
					generatedLine: 12,
					message: 'unknown symbol',
					linePos: 8,
					lineLength: 4,
					sourceLocation: { kind: 'fragment', line: 3 }
				}
			],
			fragmentSource: 'fn frag(uv: vec2f) -> vec4f {\n\treturn vec4f(0.0);\n}',
			includeSources: {
				tone: 'fn tone() -> f32 { return 1.0; }'
			},
			materialSource: {
				component: 'Scene.svelte',
				line: 22,
				column: 5
			}
		});

		const payload = getShaderCompilationDiagnostics(error);
		expect(payload).not.toBeNull();
		expect(payload?.diagnostics[0]).toMatchObject({
			generatedLine: 12,
			message: 'unknown symbol'
		});
		expect(payload?.materialSource?.component).toBe('Scene.svelte');
	});

	it('returns null for non-error values and unrelated payload kinds', () => {
		expect(getShaderCompilationDiagnostics('broken')).toBeNull();

		const error = new Error('broken') as Error & { motiongpuDiagnostics: unknown };
		error.motiongpuDiagnostics = {
			kind: 'other'
		};
		expect(getShaderCompilationDiagnostics(error)).toBeNull();
	});

	it('rejects malformed diagnostics payload shapes', () => {
		const malformed = new Error('broken') as Error & { motiongpuDiagnostics: unknown };
		malformed.motiongpuDiagnostics = {
			kind: 'shader-compilation',
			diagnostics: [
				{
					generatedLine: '12',
					message: 'bad',
					sourceLocation: { kind: 'fragment', line: 1 }
				}
			],
			fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(0.0); }',
			includeSources: {
				tone: 1
			},
			materialSource: {
				line: 'x'
			}
		};

		expect(getShaderCompilationDiagnostics(malformed)).toBeNull();
	});

	it('accepts include/define source locations and full material source metadata', () => {
		const error = attachShaderCompilationDiagnostics(new Error('compile failed'), {
			kind: 'shader-compilation',
			diagnostics: [
				{
					generatedLine: 21,
					message: 'unknown include symbol',
					sourceLocation: { kind: 'include', include: 'tone', line: 4 }
				},
				{
					generatedLine: 22,
					message: 'define expansion mismatch',
					sourceLocation: { kind: 'define', define: 'USE_TONE', line: 1 }
				},
				{
					generatedLine: 23,
					message: 'generic compile warning',
					linePos: 1,
					lineLength: 2,
					sourceLocation: null
				}
			],
			fragmentSource: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			includeSources: {
				tone: 'fn tone(v: vec3f) -> vec3f { return v; }'
			},
			materialSource: {
				component: 'ToneScene.svelte',
				file: '/app/scenes/ToneScene.svelte',
				functionName: 'createToneMaterial',
				line: 12,
				column: 8
			},
			defineBlockSource: ['const USE_TONE: bool = true;', 'const TONE_GAIN: f32 = 1.0;'].join('\n')
		});

		const payload = getShaderCompilationDiagnostics(error);
		expect(payload).not.toBeNull();
		expect(payload?.diagnostics[0]?.sourceLocation).toMatchObject({
			kind: 'include',
			include: 'tone',
			line: 4
		});
		expect(payload?.diagnostics[1]?.sourceLocation).toMatchObject({
			kind: 'define',
			define: 'USE_TONE',
			line: 1
		});
		expect(payload?.materialSource).toMatchObject({
			file: '/app/scenes/ToneScene.svelte',
			functionName: 'createToneMaterial'
		});
		expect(payload?.defineBlockSource).toContain('const USE_TONE: bool = true;');
	});

	it('rejects invalid optional diagnostics and material metadata fields', () => {
		const invalidCases: unknown[] = [
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 1,
						message: 'bad linePos',
						linePos: '4',
						sourceLocation: { kind: 'fragment', line: 1 }
					}
				],
				fragmentSource: 'fn frag() -> vec4f { return vec4f(0.0); }',
				includeSources: {},
				materialSource: null
			},
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 2,
						message: 'bad lineLength',
						lineLength: '3',
						sourceLocation: { kind: 'fragment', line: 1 }
					}
				],
				fragmentSource: 'fn frag() -> vec4f { return vec4f(0.0); }',
				includeSources: {},
				materialSource: null
			},
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 3,
						message: 'bad source location',
						sourceLocation: { kind: 'fragment' }
					}
				],
				fragmentSource: 'fn frag() -> vec4f { return vec4f(0.0); }',
				includeSources: {},
				materialSource: null
			},
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 4,
						message: 'bad material source',
						sourceLocation: { kind: 'fragment', line: 1 }
					}
				],
				fragmentSource: 'fn frag() -> vec4f { return vec4f(0.0); }',
				includeSources: {},
				materialSource: {
					component: 123
				}
			},
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 5,
						message: 'bad functionName',
						sourceLocation: { kind: 'fragment', line: 1 }
					}
				],
				fragmentSource: 'fn frag() -> vec4f { return vec4f(0.0); }',
				includeSources: {},
				materialSource: {
					functionName: 5
				}
			},
			{
				kind: 'shader-compilation',
				diagnostics: [
					{
						generatedLine: 6,
						message: 'bad define block source',
						sourceLocation: { kind: 'define', define: 'USE_TONE', line: 1 }
					}
				],
				fragmentSource: 'fn frag() -> vec4f { return vec4f(0.0); }',
				includeSources: {},
				defineBlockSource: 7,
				materialSource: null
			}
		];

		for (const payload of invalidCases) {
			const malformed = new Error('broken') as Error & { motiongpuDiagnostics: unknown };
			malformed.motiongpuDiagnostics = payload;
			expect(getShaderCompilationDiagnostics(malformed)).toBeNull();
		}
	});
});
