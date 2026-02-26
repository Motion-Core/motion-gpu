import { assertUniformName } from './uniforms';
import type { UniformLayout } from './types';

const DEFAULT_UNIFORM_FIELD = 'fragkit_unused: vec4f,';

function buildUniformStruct(layout: UniformLayout): string {
	if (layout.entries.length === 0) {
		return DEFAULT_UNIFORM_FIELD;
	}

	return layout.entries
		.map((entry) => {
			assertUniformName(entry.name);
			return `${entry.name}: ${entry.type},`;
		})
		.join('\n\t');
}

function getKeepAliveExpression(layout: UniformLayout): string {
	if (layout.entries.length === 0) {
		return 'fragkitUniforms.fragkit_unused.x';
	}

	const [firstEntry] = layout.entries;
	if (!firstEntry) {
		return 'fragkitUniforms.fragkit_unused.x';
	}

	if (firstEntry.type === 'f32') {
		return `fragkitUniforms.${firstEntry.name}`;
	}

	if (firstEntry.type === 'mat4x4f') {
		return `fragkitUniforms.${firstEntry.name}[0].x`;
	}

	return `fragkitUniforms.${firstEntry.name}.x`;
}

function buildTextureBindings(textureKeys: string[]): string {
	if (textureKeys.length === 0) {
		return '';
	}

	const declarations: string[] = [];

	for (let index = 0; index < textureKeys.length; index += 1) {
		const key = textureKeys[index];
		assertUniformName(key);
		const binding = 2 + index * 2;
		declarations.push(`@group(0) @binding(${binding}) var ${key}Sampler: sampler;`);
		declarations.push(`@group(0) @binding(${binding + 1}) var ${key}: texture_2d<f32>;`);
	}

	return declarations.join('\n');
}

function buildColorTransformHelpers(enableSrgbTransform: boolean): string {
	if (!enableSrgbTransform) {
		return '';
	}

	return `
fn fragkitLinearToSrgb(linearColor: vec3f) -> vec3f {
	let cutoff = vec3f(0.0031308);
	let lower = linearColor * 12.92;
	let higher = vec3f(1.055) * pow(linearColor, vec3f(1.0 / 2.4)) - vec3f(0.055);
	return select(lower, higher, linearColor > cutoff);
}
`;
}

function buildFragmentOutput(keepAliveExpression: string, enableSrgbTransform: boolean): string {
	if (enableSrgbTransform) {
		return `
	let fragColor = frag(in.uv);
	let fragkitKeepAlive = ${keepAliveExpression};
	let fragkitLinear = vec4f(fragColor.rgb + fragkitKeepAlive * 0.0, fragColor.a);
	let fragkitSrgb = fragkitLinearToSrgb(max(fragkitLinear.rgb, vec3f(0.0)));
	return vec4f(fragkitSrgb, fragkitLinear.a);
`;
	}

	return `
	let fragColor = frag(in.uv);
	let fragkitKeepAlive = ${keepAliveExpression};
	return vec4f(fragColor.rgb + fragkitKeepAlive * 0.0, fragColor.a);
`;
}

export function buildShaderSource(
	fragmentWgsl: string,
	uniformLayout: UniformLayout,
	textureKeys: string[] = [],
	options?: { convertLinearToSrgb?: boolean }
): string {
	const uniformFields = buildUniformStruct(uniformLayout);
	const keepAliveExpression = getKeepAliveExpression(uniformLayout);
	const textureBindings = buildTextureBindings(textureKeys);
	const enableSrgbTransform = options?.convertLinearToSrgb ?? false;
	const colorTransformHelpers = buildColorTransformHelpers(enableSrgbTransform);
	const fragmentOutput = buildFragmentOutput(keepAliveExpression, enableSrgbTransform);

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
${textureBindings}
${colorTransformHelpers}

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
	${fragmentOutput}
}
`;
}
