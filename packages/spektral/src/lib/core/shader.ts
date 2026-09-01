import { assertUniformName } from './uniforms.js';
import { SPEKTRAL_FRAGMENT_CONTEXT_WGSL } from './fragment-context.js';
import type { MaterialLineMap, MaterialSourceLocation } from './material-preprocess.js';
import type { StorageBufferType, UniformLayout } from './types.js';

type ComputeShaderSourceLocation = {
	kind: 'compute';
	line: number;
};

/**
 * Fallback uniform field used when no custom uniforms are provided.
 */
const DEFAULT_UNIFORM_FIELD = 'spektral_unused: vec4f,';

/**
 * Builds WGSL struct fields for user uniforms.
 */
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

/**
 * Builds a numeric expression that references one uniform value to keep bindings alive.
 */
function getKeepAliveExpression(layout: UniformLayout): string {
	if (layout.entries.length === 0) {
		return 'spektralUniforms.spektral_unused.x';
	}

	const [firstEntry] = layout.entries;
	if (!firstEntry) {
		return 'spektralUniforms.spektral_unused.x';
	}

	if (firstEntry.type === 'f32') {
		return `spektralUniforms.${firstEntry.name}`;
	}

	if (firstEntry.type === 'mat4x4f') {
		return `spektralUniforms.${firstEntry.name}[0].x`;
	}

	return `spektralUniforms.${firstEntry.name}.x`;
}

/**
 * Builds texture sampler/texture binding declarations.
 */
function buildTextureBindings(textureKeys: readonly string[]): string {
	if (textureKeys.length === 0) {
		return '';
	}

	const declarations: string[] = [];

	for (let index = 0; index < textureKeys.length; index += 1) {
		const key = textureKeys[index];
		if (key === undefined) {
			continue;
		}

		assertUniformName(key);
		const binding = 2 + index * 2;
		declarations.push(`@group(0) @binding(${binding}) var ${key}Sampler: sampler;`);
		declarations.push(`@group(0) @binding(${binding + 1}) var ${key}: texture_2d<f32>;`);
	}

	return declarations.join('\n');
}

/**
 * Builds read-only storage buffer bindings for fragment shader.
 */
function buildFragmentStorageBufferBindings(
	storageBufferKeys: readonly string[],
	definitions: Readonly<Record<string, { type: StorageBufferType }>>
): string {
	if (storageBufferKeys.length === 0) {
		return '';
	}

	const declarations: string[] = [];

	for (let index = 0; index < storageBufferKeys.length; index += 1) {
		const key = storageBufferKeys[index];
		if (key === undefined) {
			continue;
		}

		const definition = definitions[key];
		if (!definition) {
			continue;
		}

		declarations.push(
			`@group(1) @binding(${index}) var<storage, read> ${key}: ${definition.type};`
		);
	}

	return declarations.join('\n');
}

/**
 * Optionally returns helper WGSL for linear-to-sRGB conversion.
 */
function buildColorTransformHelpers(enableSrgbTransform: boolean): string {
	if (!enableSrgbTransform) {
		return '';
	}

	return `
fn spektralLinearToSrgb(linearColor: vec3f) -> vec3f {
	let cutoff = vec3f(0.0031308);
	let lower = linearColor * 12.92;
	let higher = vec3f(1.055) * pow(linearColor, vec3f(1.0 / 2.4)) - vec3f(0.055);
	return select(lower, higher, linearColor > cutoff);
}
`;
}

function buildCanvasPremultiplyHelper(enabled: boolean): string {
	if (!enabled) {
		return '';
	}

	return `
fn spektralPremultiplyForCanvas(color: vec4f) -> vec4f {
	let spektralAlpha = clamp(color.a, 0.0, 1.0);
	return vec4f(color.rgb * spektralAlpha, spektralAlpha);
}
`;
}

/**
 * Builds fragment output code with optional color-space conversion.
 */
function buildFragmentOutput(
	keepAliveExpression: string,
	enableSrgbTransform: boolean,
	premultiplyOutputAlpha: boolean
): string {
	if (enableSrgbTransform) {
		if (premultiplyOutputAlpha) {
			return `
	let fragColor = frag(in.uv);
	let spektralKeepAlive = ${keepAliveExpression};
	let spektralLinear = vec4f(fragColor.rgb + spektralKeepAlive * 0.0, fragColor.a);
	let spektralSrgb = spektralLinearToSrgb(max(spektralLinear.rgb, vec3f(0.0)));
	let spektralOutput = vec4f(spektralSrgb, spektralLinear.a);
	return spektralPremultiplyForCanvas(spektralOutput);
`;
		}

		return `
	let fragColor = frag(in.uv);
	let spektralKeepAlive = ${keepAliveExpression};
	let spektralLinear = vec4f(fragColor.rgb + spektralKeepAlive * 0.0, fragColor.a);
	let spektralSrgb = spektralLinearToSrgb(max(spektralLinear.rgb, vec3f(0.0)));
	return vec4f(spektralSrgb, spektralLinear.a);
`;
	}

	if (premultiplyOutputAlpha) {
		return `
	let fragColor = frag(in.uv);
	let spektralKeepAlive = ${keepAliveExpression};
	let spektralOutput = vec4f(fragColor.rgb + spektralKeepAlive * 0.0, fragColor.a);
	return spektralPremultiplyForCanvas(spektralOutput);
`;
	}

	return `
	let fragColor = frag(in.uv);
	let spektralKeepAlive = ${keepAliveExpression};
	return vec4f(fragColor.rgb + spektralKeepAlive * 0.0, fragColor.a);
`;
}

/**
 * 1-based map from generated WGSL lines to original material source lines.
 */
export type ShaderLineMap = Array<(MaterialSourceLocation | ComputeShaderSourceLocation) | null>;

/**
 * Result of shader source generation with line mapping metadata.
 */
export interface BuiltShaderSource {
	/**
	 * Full WGSL source code.
	 */
	code: string;
	/**
	 * 1-based generated-line map to material source locations.
	 */
	lineMap: ShaderLineMap;
}

function countLines(source: string, end = source.length): number {
	let lineCount = 1;
	for (let index = 0; index < end; index += 1) {
		if (source.charCodeAt(index) === 10) {
			lineCount += 1;
		}
	}
	return lineCount;
}

/**
 * Assembles complete WGSL shader source used by the fullscreen renderer pipeline.
 *
 * @param fragmentWgsl - User fragment shader code containing `frag(uv: vec2f) -> vec4f`.
 * @param uniformLayout - Resolved uniform layout.
 * @param textureKeys - Sorted texture keys.
 * @param options - Shader build options.
 * @returns Complete WGSL source for vertex + fragment stages.
 */
export function buildShaderSource(
	fragmentWgsl: string,
	uniformLayout: UniformLayout,
	textureKeys: readonly string[] = [],
	options?: {
		convertLinearToSrgb?: boolean;
		premultiplyOutputAlpha?: boolean;
		storageBufferKeys?: readonly string[];
		storageBufferDefinitions?: Readonly<Record<string, { type: StorageBufferType }>>;
	}
): string {
	const uniformFields = buildUniformStruct(uniformLayout);
	const keepAliveExpression = getKeepAliveExpression(uniformLayout);
	const textureBindings = buildTextureBindings(textureKeys);
	const enableSrgbTransform = options?.convertLinearToSrgb ?? false;
	const premultiplyOutputAlpha = options?.premultiplyOutputAlpha ?? false;
	const colorTransformHelpers = [
		buildColorTransformHelpers(enableSrgbTransform),
		buildCanvasPremultiplyHelper(premultiplyOutputAlpha)
	]
		.filter(Boolean)
		.join('\n');
	const fragmentOutput = buildFragmentOutput(
		keepAliveExpression,
		enableSrgbTransform,
		premultiplyOutputAlpha
	);
	const storageBufferBindings = buildFragmentStorageBufferBindings(
		options?.storageBufferKeys ?? [],
		options?.storageBufferDefinitions ?? {}
	);

	return `
struct SpektralFrame {
	time: f32,
	delta: f32,
	resolution: vec2f,
};

struct SpektralUniforms {
	${uniformFields}
};

@group(0) @binding(0) var<uniform> spektralFrame: SpektralFrame;
@group(0) @binding(1) var<uniform> spektralUniforms: SpektralUniforms;
${textureBindings}
${storageBufferBindings ? '\n' + storageBufferBindings : ''}
${colorTransformHelpers}
${SPEKTRAL_FRAGMENT_CONTEXT_WGSL}

struct SpektralVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@vertex
fn spektralVertex(@builtin(vertex_index) index: u32) -> SpektralVertexOut {
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

${fragmentWgsl}

@fragment
fn spektralFragmentMain(in: SpektralVertexOut) -> @location(0) vec4f {
	spektralFragment.uv = in.uv;
	${fragmentOutput}
}
`;
}

/**
 * Assembles complete WGSL shader source with material-source line mapping metadata.
 */
export function buildShaderSourceWithMap(
	fragmentWgsl: string,
	uniformLayout: UniformLayout,
	textureKeys: readonly string[] = [],
	options?: {
		convertLinearToSrgb?: boolean;
		premultiplyOutputAlpha?: boolean;
		fragmentLineMap?: MaterialLineMap;
		storageBufferKeys?: readonly string[];
		storageBufferDefinitions?: Readonly<Record<string, { type: StorageBufferType }>>;
	}
): BuiltShaderSource {
	const code = buildShaderSource(fragmentWgsl, uniformLayout, textureKeys, options);
	const fragmentStartIndex = code.indexOf(fragmentWgsl);
	const lineCount = countLines(code);
	const lineMap: ShaderLineMap = new Array(lineCount + 1).fill(null);

	if (fragmentStartIndex === -1) {
		return {
			code,
			lineMap
		};
	}

	const fragmentStartLine = countLines(code, fragmentStartIndex);
	const fragmentLineCount = countLines(fragmentWgsl);

	for (let line = 0; line < fragmentLineCount; line += 1) {
		const generatedLine = fragmentStartLine + line;
		lineMap[generatedLine] = options?.fragmentLineMap?.[line + 1] ?? {
			kind: 'fragment',
			line: line + 1
		};
	}

	return {
		code,
		lineMap
	};
}

/**
 * Assembles WGSL shader source used by renderer-managed fragment ping-pong passes.
 *
 * The shader exposes the same group(0) frame/uniform/texture bindings as the
 * material fragment shader and adds group(1) bindings for the previous
 * ping-pong texture.
 */
export function buildPingPongShaderSource(
	fragmentWgsl: string,
	uniformLayout: UniformLayout,
	textureKeys: readonly string[] = []
): string {
	const uniformFields = buildUniformStruct(uniformLayout);
	const keepAliveExpression = getKeepAliveExpression(uniformLayout);
	const textureBindings = buildTextureBindings(textureKeys);

	return `
struct SpektralFrame {
	time: f32,
	delta: f32,
	resolution: vec2f,
};

struct SpektralUniforms {
	${uniformFields}
};

@group(0) @binding(0) var<uniform> spektralFrame: SpektralFrame;
@group(0) @binding(1) var<uniform> spektralUniforms: SpektralUniforms;
${textureBindings}

@group(1) @binding(0) var spektralPreviousSampler: sampler;
@group(1) @binding(1) var spektralPrevious: texture_2d<f32>;
${SPEKTRAL_FRAGMENT_CONTEXT_WGSL}

struct SpektralPingPongVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@vertex
fn spektralPingPongVertex(@builtin(vertex_index) index: u32) -> SpektralPingPongVertexOut {
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -3.0),
		vec2f(-1.0, 1.0),
		vec2f(3.0, 1.0)
	);

	let position = positions[index];
	var out: SpektralPingPongVertexOut;
	out.position = vec4f(position, 0.0, 1.0);
	out.uv = vec2f((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
	return out;
}

${fragmentWgsl}

@fragment
fn spektralPingPongFragment(in: SpektralPingPongVertexOut) -> @location(0) vec4f {
	spektralFragment.uv = in.uv;
	let fragColor = frag(in.uv);
	let spektralKeepAlive = ${keepAliveExpression};
	return vec4f(fragColor.rgb + spektralKeepAlive * 0.0, fragColor.a);
}
`;
}

/**
 * Assembles ping-pong fragment WGSL with material-source line mapping metadata.
 */
export function buildPingPongShaderSourceWithMap(
	fragmentWgsl: string,
	uniformLayout: UniformLayout,
	textureKeys: readonly string[] = [],
	options?: {
		fragmentLineMap?: MaterialLineMap;
	}
): BuiltShaderSource {
	const code = buildPingPongShaderSource(fragmentWgsl, uniformLayout, textureKeys);
	const fragmentStartIndex = code.indexOf(fragmentWgsl);
	const lineCount = countLines(code);
	const lineMap: ShaderLineMap = new Array(lineCount + 1).fill(null);

	if (fragmentStartIndex === -1) {
		return {
			code,
			lineMap
		};
	}

	const fragmentStartLine = countLines(code, fragmentStartIndex);
	const fragmentLineCount = countLines(fragmentWgsl);

	for (let line = 0; line < fragmentLineCount; line += 1) {
		const generatedLine = fragmentStartLine + line;
		lineMap[generatedLine] = options?.fragmentLineMap?.[line + 1] ?? {
			kind: 'fragment',
			line: line + 1
		};
	}

	return {
		code,
		lineMap
	};
}

/**
 * Converts source location metadata to user-facing diagnostics label.
 */
export function formatShaderSourceLocation(
	location: (MaterialSourceLocation | ComputeShaderSourceLocation) | null
): string | null {
	if (!location) {
		return null;
	}

	if (location.kind === 'fragment') {
		return `fragment line ${location.line}`;
	}

	if (location.kind === 'include') {
		return `include <${location.include}> line ${location.line}`;
	}

	if (location.kind === 'compute') {
		return `compute line ${location.line}`;
	}

	return `define "${location.define}" line ${location.line}`;
}
