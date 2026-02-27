import { describe, expect, it } from 'vitest';
import { BlitPass, CopyPass, ShaderPass } from '../../lib/passes';

describe('built-in passes', () => {
	it('configures default BlitPass flow', () => {
		const pass = new BlitPass();
		expect(pass.enabled).toBe(true);
		expect(pass.needsSwap).toBe(true);
		expect(pass.input).toBe('source');
		expect(pass.output).toBe('target');
		expect(pass.clear).toBe(false);
		expect(pass.preserve).toBe(true);
	});

	it('configures default CopyPass flow', () => {
		const pass = new CopyPass();
		expect(pass.enabled).toBe(true);
		expect(pass.needsSwap).toBe(true);
		expect(pass.input).toBe('source');
		expect(pass.output).toBe('target');
		expect(pass.clear).toBe(false);
		expect(pass.preserve).toBe(true);
	});

	it('validates ShaderPass fragment contract', () => {
		expect(
			() =>
				new ShaderPass({
					fragment: 'fn broken() -> vec4f { return vec4f(1.0); }'
				})
		).toThrow(/fn shade\(inputColor: vec4f, uv: vec2f\) -> vec4f/);

		const pass = new ShaderPass({
			fragment: `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return vec4f(inputColor.rgb * vec3f(uv, 1.0), inputColor.a);
}
`
		});
		expect(pass.getFragment()).toContain('fn shade(inputColor: vec4f, uv: vec2f)');
	});
});
