import { describe, expect, it } from 'vitest';
import { createSpektralErrorOverlayModel } from '../../lib/core/error-overlay-model.js';
import type { SpektralErrorReport } from '../../lib/core/error-report.js';

function report(overrides: Partial<SpektralErrorReport> = {}): SpektralErrorReport {
	return {
		code: 'SPEKTRAL_RUNTIME_ERROR',
		severity: 'error',
		recoverable: true,
		title: 'Runtime error',
		message: 'Runtime error: render failed',
		hint: 'Retry.',
		details: [],
		stack: [],
		rawMessage: 'Runtime error: render failed',
		phase: 'render',
		source: null,
		context: null,
		shader: null,
		...overrides
	};
}

describe('createSpektralErrorOverlayModel', () => {
	it('hides empty and title-equivalent messages', () => {
		expect(createSpektralErrorOverlayModel(report({ message: '  ' })).displayMessage).toBe('');
		expect(
			createSpektralErrorOverlayModel(report({ message: ' runtime ERROR...! ' })).displayMessage
		).toBe('');
	});

	it('strips a case-insensitive escaped title prefix', () => {
		expect(
			createSpektralErrorOverlayModel(
				report({ title: 'GPU [pass]+ failed?', message: 'gpu [pass]+ FAILED? | missing output' })
			).displayMessage
		).toBe('missing output');
	});

	it('preserves a message without a duplicated title prefix', () => {
		expect(
			createSpektralErrorOverlayModel(report({ message: '  Render pipeline creation failed.  ' }))
				.displayMessage
		).toBe('Render pipeline creation failed.');
	});

	it('formats the complete runtime context exactly', () => {
		expect(
			createSpektralErrorOverlayModel(
				report({
					context: {
						materialSignature: '{"fragment":"hash"}',
						passGraph: {
							passCount: 2,
							enabledPassCount: 1,
							inputs: ['source'],
							outputs: []
						},
						activeRenderTargets: ['fxMain']
					}
				})
			).runtimeContextText
		).toBe(
			[
				'materialSignature:',
				'  {',
				'    "fragment": "hash"',
				'  }',
				'passGraph:',
				'  passCount: 2',
				'  enabledPassCount: 1',
				'  inputs:',
				'    - source',
				'  outputs:',
				'    - <none>',
				'activeRenderTargets:',
				'  - fxMain'
			].join('\n')
		);
	});

	it('handles absent, blank, invalid and empty runtime values', () => {
		expect(createSpektralErrorOverlayModel(report()).runtimeContextText).toBe('');
		expect(
			createSpektralErrorOverlayModel(
				report({ context: { materialSignature: '  ', activeRenderTargets: [] } })
			).runtimeContextText
		).toBe('materialSignature:\n  <empty>\nactiveRenderTargets:\n  - <none>');
		expect(
			createSpektralErrorOverlayModel(
				report({ context: { materialSignature: '  raw\nsignature  ', activeRenderTargets: [] } })
			).runtimeContextText
		).toBe('materialSignature:\n  raw\n  signature\nactiveRenderTargets:\n  - <none>');
	});

	it('provides compact frozen shader metadata shared by every overlay', () => {
		const model = createSpektralErrorOverlayModel(
			report({
				shader: {
					passKind: 'ShaderPass',
					passLabel: 'Bloom composite',
					stage: 'fragment',
					inputFormat: 'rgba16float',
					outputFormat: 'rgba8unorm',
					sourceKind: 'user',
					line: 12,
					column: 7
				}
			})
		);
		expect(model.metadata).toEqual([
			{ label: 'Pass', value: 'Bloom composite (ShaderPass)' },
			{ label: 'Stage', value: 'fragment' },
			{ label: 'Formats', value: 'rgba16float → rgba8unorm' },
			{ label: 'Source', value: 'user' },
			{ label: 'Location', value: '12:7' }
		]);
		expect(Object.isFrozen(model)).toBe(true);
		expect(Object.isFrozen(model.metadata)).toBe(true);
		expect(Object.isFrozen(model.metadata[0])).toBe(true);
	});

	it('labels wrapper diagnostics as library-owned source', () => {
		const model = createSpektralErrorOverlayModel(
			report({
				shader: {
					passKind: 'ShaderPass',
					stage: 'fragment',
					sourceKind: 'wrapper'
				}
			})
		);
		expect(model.metadata).toContainEqual({ label: 'Source', value: 'library wrapper' });
	});
});
