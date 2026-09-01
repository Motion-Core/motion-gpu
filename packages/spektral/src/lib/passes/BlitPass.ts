import { FullscreenPass, type FullscreenPassOptions } from './FullscreenPass.js';

const FULLSCREEN_BLIT_SHADER = `
struct SpektralVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@group(0) @binding(0) var spektralBlitSampler: sampler;
@group(0) @binding(1) var spektralBlitTexture: texture_2d<f32>;

@vertex
fn spektralBlitVertex(@builtin(vertex_index) index: u32) -> SpektralVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: SpektralVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = (position + vec2f(1.0, 1.0)) * 0.5;
	return out;
}

@fragment
fn spektralBlitFragment(in: SpektralVertexOut) -> @location(0) vec4f {
	return textureSample(spektralBlitTexture, spektralBlitSampler, in.uv);
}
`;

export type BlitPassOptions = FullscreenPassOptions;

/**
 * Fullscreen texture blit pass.
 */
export class BlitPass extends FullscreenPass {
	protected getProgram(): string {
		return FULLSCREEN_BLIT_SHADER;
	}

	constructor(options: BlitPassOptions = {}) {
		super('BlitPass', options);
	}

	protected getVertexEntryPoint(): string {
		return 'spektralBlitVertex';
	}

	protected getFragmentEntryPoint(): string {
		return 'spektralBlitFragment';
	}
}
