import { FullscreenPass, type FullscreenPassOptions } from './FullscreenPass.js';

const SHADER_PASS_CONTRACT =
	/\bfn\s+shade\s*\(\s*inputColor\s*:\s*vec4f\s*,\s*uv\s*:\s*vec2f\s*\)\s*->\s*vec4f/;

export interface ShaderPassOptions extends FullscreenPassOptions {
	fragment: string;
}

function buildShaderPassProgram(fragment: string): string {
	if (!SHADER_PASS_CONTRACT.test(fragment)) {
		throw new Error(
			'ShaderPass fragment must declare `fn shade(inputColor: vec4f, uv: vec2f) -> vec4f`.'
		);
	}

	return `
struct MotionGPUVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@group(0) @binding(0) var motiongpuShaderPassSampler: sampler;
@group(0) @binding(1) var motiongpuShaderPassTexture: texture_2d<f32>;

@vertex
fn motiongpuShaderPassVertex(@builtin(vertex_index) index: u32) -> MotionGPUVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: MotionGPUVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = (position + vec2f(1.0, 1.0)) * 0.5;
	return out;
}

${fragment}

@fragment
fn motiongpuShaderPassFragment(in: MotionGPUVertexOut) -> @location(0) vec4f {
	let inputColor = textureSample(motiongpuShaderPassTexture, motiongpuShaderPassSampler, in.uv);
	return shade(inputColor, in.uv);
}
`;
}

/**
 * Fullscreen programmable shader pass.
 */
export class ShaderPass extends FullscreenPass {
	private fragment: string;
	private program: string;

	constructor(options: ShaderPassOptions) {
		super(options);
		this.fragment = options.fragment;
		this.program = buildShaderPassProgram(options.fragment);
	}

	/**
	 * Replaces current shader fragment and invalidates pipeline cache.
	 */
	setFragment(fragment: string): void {
		this.fragment = fragment;
		this.program = buildShaderPassProgram(fragment);
		this.invalidateFullscreenCache();
	}

	getFragment(): string {
		return this.fragment;
	}

	protected getProgram(): string {
		return this.program;
	}

	protected getVertexEntryPoint(): string {
		return 'motiongpuShaderPassVertex';
	}

	protected getFragmentEntryPoint(): string {
		return 'motiongpuShaderPassFragment';
	}
}
