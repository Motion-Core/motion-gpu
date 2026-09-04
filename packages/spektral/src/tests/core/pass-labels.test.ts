import { describe, expect, it } from 'vitest';
import type { RenderPass } from '../../lib/core/types';
import {
	BlitPass,
	ComputePass,
	CopyPass,
	PingPongComputePass,
	PingPongShaderPass,
	ShaderPass
} from '../../lib/passes';

const compute = `
@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) id: vec3u) {
	let x = id.x;
}
`;

const shader = `
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	return inputColor * vec4f(uv, 1.0, 1.0);
}
`;

const feedback = `
fn frag(uv: vec2f) -> vec4f {
	return textureSampleLevel(spektralPrevious, spektralPreviousSampler, uv, 0.0);
}
`;

describe('render pass labels', () => {
	it('preserves optional labels on every built-in pass kind', () => {
		const passes = [
			new BlitPass({ label: 'blit' }),
			new CopyPass({ label: 'copy' }),
			new ShaderPass({ label: 'shader', fragment: shader }),
			new ComputePass({ label: 'compute', compute }),
			new PingPongComputePass({
				label: 'ping-compute',
				compute,
				resources: {
					previous: { texture: 'state', access: 'sampled', pingPong: 'read' },
					next: { texture: 'state', access: 'storage-write', pingPong: 'write' }
				}
			}),
			new PingPongShaderPass({ label: 'ping-shader', fragment: feedback, target: 'state' })
		];

		expect(passes.map((pass) => pass.label)).toEqual([
			'blit',
			'copy',
			'shader',
			'compute',
			'ping-compute',
			'ping-shader'
		]);
	});

	it('keeps labels optional for custom and built-in passes', () => {
		const custom = { render() {} } satisfies RenderPass;
		expect(custom).not.toHaveProperty('label');
		expect(new BlitPass().label).toBeUndefined();
	});
});
