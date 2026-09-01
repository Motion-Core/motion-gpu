import type { SpektralErrorReport } from '../src/lib/core/error-report';

export const errorOverlayStyleReport: SpektralErrorReport = {
	code: 'WGSL_COMPILATION_FAILED',
	severity: 'error',
	recoverable: true,
	title: 'WGSL compilation failed',
	message: "[fragment line 12 | generated WGSL line 268] expected '{' for function body",
	hint: 'Check WGSL line numbers below and verify struct/binding/function signatures.',
	details: ['error: expected opening brace', 'generated WGSL line 268, column 2'],
	stack: ['compileShader (renderer.ts:184)', 'initializeRenderer (renderer.ts:92)'],
	rawMessage: "expected '{' for function body",
	phase: 'initialization',
	source: {
		component: 'fragment',
		location: 'embed (fragment line 12)',
		line: 12,
		column: 2,
		snippet: [
			{ number: 9, code: '}', highlight: false },
			{ number: 10, code: '', highlight: false },
			{ number: 11, code: 'fn bodySdf(p_world: vec3f) -> f32', highlight: false },
			{
				number: 12,
				code: '    let p = rotateZ(p_world - vec3f(0.02, -0.05, 0.0), 0.58);',
				highlight: true
			},
			{
				number: 13,
				code: '    let s0 = sdSphere(p - vec3f(0.64, -0.24, 0.0), 0.55);',
				highlight: false
			},
			{
				number: 14,
				code: '    let s1 = sdSphere(p - vec3f(0.16, -0.16, 0.0), 0.47);',
				highlight: false
			},
			{
				number: 15,
				code: '    let s2 = sdSphere(p - vec3f(-0.30, 0.02, 0.0), 0.35);',
				highlight: false
			}
		]
	},
	context: {
		materialSignature: 'error-overlay-style-proof',
		activeRenderTargets: ['canvas']
	}
};
