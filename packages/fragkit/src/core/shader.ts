import { assertUniformName } from './uniforms';

const DEFAULT_UNIFORM_FIELD = 'fragkit_unused: vec4f,';

function buildUniformStruct(uniformKeys: string[]): string {
	if (uniformKeys.length === 0) {
		return DEFAULT_UNIFORM_FIELD;
	}

	return uniformKeys
		.map((name) => {
			assertUniformName(name);
			return `${name}: vec4f,`;
		})
		.join('\n\t');
}

function getKeepAliveUniform(uniformKeys: string[]): string {
	if (uniformKeys.length === 0) {
		return 'fragkit_unused';
	}

	return uniformKeys[0] as string;
}

export function buildShaderSource(fragmentWgsl: string, uniformKeys: string[]): string {
	const uniformFields = buildUniformStruct(uniformKeys);
	const keepAliveUniform = getKeepAliveUniform(uniformKeys);

	return `
struct FragkitFrame {
	time: f32,
	delta: f32,
	resolution: vec2f,
};

struct FragkitUniforms {
	${uniformFields}
};

@group(0) @binding(0) var<uniform> fragkitFrame: FragkitFrame;
@group(0) @binding(1) var<uniform> fragkitUniforms: FragkitUniforms;

struct FragkitVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@vertex
fn fragkitVertex(@builtin(vertex_index) index: u32) -> FragkitVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: FragkitVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = (position + vec2f(1.0, 1.0)) * 0.5;
	return out;
}

${fragmentWgsl}

@fragment
fn fragkitFragment(in: FragkitVertexOut) -> @location(0) vec4f {
	let fragColor = frag(in.uv);
	let fragkitKeepAlive = fragkitUniforms.${keepAliveUniform}.x;
	return vec4f(fragColor.rgb + fragkitKeepAlive * 0.0, fragColor.a);
}
`;
}
