import type { StorageBufferType, UniformLayout } from './types.js';
import { textureSampleScalarType } from './format-capabilities.js';

/** Bounded locator for the single public compute entrypoint. */
export const COMPUTE_ENTRY_CONTRACT = /\bfn\s+compute\s*\(/;

const GLOBAL_INVOCATION_ID_PATTERN = /@builtin\s*\(\s*global_invocation_id\s*\)/;
const WORKGROUP_DIMENSION_MIN = 1;
const WORKGROUP_DIMENSION_MAX = 65535;
const DEFAULT_UNIFORM_FIELD = 'spektral_unused: vec4f,';

export type ComputeWorkgroupSize = readonly [number, number?, number?];

export type ResolvedComputeShaderBinding =
	| Readonly<{
			kind: 'sampled-texture';
			alias: string;
			binding: number;
			scalarType: 'f32' | 'u32' | 'i32';
	  }>
	| Readonly<{
			kind: 'storage-texture';
			alias: string;
			binding: number;
			format: GPUTextureFormat;
	  }>
	| Readonly<{
			kind: 'storage-buffer';
			alias: string;
			binding: number;
			access: 'storage-read' | 'storage-read-write';
			wgslType: StorageBufferType;
	  }>
	| Readonly<{
			kind: 'sampler';
			alias: string;
			binding: number;
			samplerType: GPUSamplerBindingType;
	  }>;

export interface ComputeShaderSourceLocation {
	kind: 'compute';
	line: number;
}

/** 1-based line map from generated compute WGSL to user compute source. */
export type ComputeShaderLineMap = Array<ComputeShaderSourceLocation | null>;

export interface BuiltComputeShaderSource {
	code: string;
	lineMap: ComputeShaderLineMap;
}

export interface BuildComputeShaderSourceOptions {
	compute: string;
	uniformLayout: UniformLayout;
	resources: readonly ResolvedComputeShaderBinding[];
}

function stripWgslComments(source: string): string {
	let result = '';
	let index = 0;
	let blockDepth = 0;
	let lineComment = false;

	while (index < source.length) {
		const current = source[index] ?? '';
		const next = source[index + 1] ?? '';

		if (lineComment) {
			if (current === '\n') {
				lineComment = false;
				result += '\n';
			} else {
				result += ' ';
			}
			index += 1;
			continue;
		}

		if (blockDepth > 0) {
			if (current === '/' && next === '*') {
				blockDepth += 1;
				result += '  ';
				index += 2;
				continue;
			}
			if (current === '*' && next === '/') {
				blockDepth -= 1;
				result += '  ';
				index += 2;
				continue;
			}
			result += current === '\n' ? '\n' : ' ';
			index += 1;
			continue;
		}

		if (current === '/' && next === '/') {
			lineComment = true;
			result += '  ';
			index += 2;
			continue;
		}
		if (current === '/' && next === '*') {
			blockDepth = 1;
			result += '  ';
			index += 2;
			continue;
		}

		result += current;
		index += 1;
	}

	return result;
}

interface ComputeEntrypoint {
	attributes: string;
	openParenIndex: number;
}

interface WorkgroupSizeAnalysis {
	literal: [number, number, number] | null;
}

function findComputeEntrypoint(compute: string): ComputeEntrypoint | null {
	const entrypoint = COMPUTE_ENTRY_CONTRACT.exec(compute);
	if (!entrypoint) return null;
	const openParenIndex = entrypoint.index + entrypoint[0].length - 1;
	const prefix = compute.slice(0, entrypoint.index);
	const boundary = Math.max(prefix.lastIndexOf('}'), prefix.lastIndexOf(';'));
	return {
		attributes: prefix.slice(boundary + 1),
		openParenIndex
	};
}

function extractComputeParamList(compute: string, entrypoint: ComputeEntrypoint): string | null {
	const { openParenIndex } = entrypoint;

	let depth = 0;
	for (let index = openParenIndex; index < compute.length; index += 1) {
		const char = compute[index];
		if (char === '(') {
			depth += 1;
		} else if (char === ')') {
			depth -= 1;
			if (depth === 0) return compute.slice(openParenIndex + 1, index);
		}
	}
	return null;
}

function splitWorkgroupSizeArguments(attributeBody: string): string[] {
	const arguments_: string[] = [];
	let argumentStart = 0;
	let nestedParentheses = 0;

	for (let index = 0; index < attributeBody.length; index += 1) {
		const char = attributeBody[index];
		if (char === '(') {
			nestedParentheses += 1;
		} else if (char === ')') {
			if (nestedParentheses === 0) {
				throw new Error('Malformed @workgroup_size attribute: unexpected closing parenthesis.');
			}
			nestedParentheses -= 1;
		} else if (char === ',' && nestedParentheses === 0) {
			arguments_.push(attributeBody.slice(argumentStart, index).trim());
			argumentStart = index + 1;
		}
	}

	if (nestedParentheses !== 0) {
		throw new Error('Malformed @workgroup_size attribute: unclosed nested expression.');
	}
	arguments_.push(attributeBody.slice(argumentStart).trim());

	if (
		arguments_.length < 1 ||
		arguments_.length > 3 ||
		arguments_.some((argument) => argument.length === 0)
	) {
		throw new Error(
			'Malformed @workgroup_size attribute: expected between one and three non-empty dimensions.'
		);
	}

	return arguments_;
}

function extractWorkgroupSizeArguments(attributes: string): string[] {
	const markers = [...attributes.matchAll(/@workgroup_size\b/g)];
	if (markers.length !== 1) {
		throw new Error(
			`Malformed @workgroup_size attribute: expected exactly one declaration, found ${markers.length}.`
		);
	}

	let openParenIndex = (markers[0]?.index ?? 0) + (markers[0]?.[0].length ?? 0);
	while (/\s/.test(attributes[openParenIndex] ?? '')) openParenIndex += 1;
	if (attributes[openParenIndex] !== '(') {
		throw new Error('Malformed @workgroup_size attribute: expected an opening parenthesis.');
	}

	let depth = 1;
	for (let index = openParenIndex + 1; index < attributes.length; index += 1) {
		const char = attributes[index];
		if (char === '(') {
			depth += 1;
		} else if (char === ')') {
			depth -= 1;
			if (depth === 0) {
				return splitWorkgroupSizeArguments(attributes.slice(openParenIndex + 1, index));
			}
		}
	}

	throw new Error('Malformed @workgroup_size attribute: missing closing parenthesis.');
}

function unwrapParenthesizedExpression(expression: string): string {
	let result = expression.trim();
	while (result.startsWith('(') && result.endsWith(')')) {
		let depth = 0;
		let wrapsEntireExpression = true;
		for (let index = 0; index < result.length; index += 1) {
			const char = result[index];
			if (char === '(') depth += 1;
			if (char === ')') depth -= 1;
			if (depth === 0 && index < result.length - 1) {
				wrapsEntireExpression = false;
				break;
			}
		}
		if (!wrapsEntireExpression) break;
		result = result.slice(1, -1).trim();
	}
	return result;
}

function parseIntegerLiteral(expression: string): number | null {
	const unwrapped = unwrapParenthesizedExpression(expression);
	if (!/^[+-]?(?:\d+|0[xX][\dA-Fa-f]+)[iu]?$/.test(unwrapped)) return null;

	const value = Number(unwrapped.replace(/[iu]$/, ''));
	assertWorkgroupDimension(value);
	return value;
}

function analyzeWorkgroupSize(compute: string): WorkgroupSizeAnalysis {
	const source = stripWgslComments(compute);
	const entrypoint = findComputeEntrypoint(source);
	if (!entrypoint) {
		throw new Error('Could not locate fn compute(...) while analyzing @workgroup_size.');
	}

	const arguments_ = extractWorkgroupSizeArguments(entrypoint.attributes);
	const literalDimensions = arguments_.map(parseIntegerLiteral);
	if (literalDimensions.some((dimension) => dimension === null)) {
		return { literal: null };
	}

	return {
		literal: [literalDimensions[0]!, literalDimensions[1] ?? 1, literalDimensions[2] ?? 1]
	};
}

function assertWorkgroupDimension(value: number): void {
	if (
		!Number.isFinite(value) ||
		!Number.isInteger(value) ||
		value < WORKGROUP_DIMENSION_MIN ||
		value > WORKGROUP_DIMENSION_MAX
	) {
		throw new Error(
			`@workgroup_size dimensions must be integers in range ${WORKGROUP_DIMENSION_MIN}-${WORKGROUP_DIMENSION_MAX}, got ${value}.`
		);
	}
}

function normalizeExplicitWorkgroupSize(
	workgroupSize: ComputeWorkgroupSize
): [number, number, number] {
	if (workgroupSize.length < 1 || workgroupSize.length > 3) {
		throw new Error('workgroupSize must contain between one and three dimensions.');
	}
	const resolved: [number, number, number] = [
		workgroupSize[0],
		workgroupSize[1] ?? 1,
		workgroupSize[2] ?? 1
	];
	for (const value of resolved) assertWorkgroupDimension(value);
	return resolved;
}

export function assertComputeContract(
	compute: string,
	explicitWorkgroupSize?: ComputeWorkgroupSize
): void {
	const source = stripWgslComments(compute);
	const entrypoint = findComputeEntrypoint(source);
	if (
		!entrypoint ||
		!/@compute\b/.test(entrypoint.attributes) ||
		!/@workgroup_size\s*\(/.test(entrypoint.attributes)
	) {
		throw new Error(
			'Compute shader must declare `@compute` and `@workgroup_size(...)` on `fn compute(...)`. ' +
				'Attribute order may vary, but the function must be named `compute`.'
		);
	}

	const params = extractComputeParamList(source, entrypoint);
	if (!params || !GLOBAL_INVOCATION_ID_PATTERN.test(params)) {
		throw new Error('Compute shader must include a `@builtin(global_invocation_id)` parameter.');
	}
	resolveWorkgroupSize(source, explicitWorkgroupSize);
}

export function extractWorkgroupSize(compute: string): [number, number, number] {
	const { literal } = analyzeWorkgroupSize(compute);
	if (!literal) {
		throw new Error(
			'Could not extract @workgroup_size as a literal from compute shader source. ' +
				'Pass an explicit workgroupSize option when the attribute uses an override or constant expression.'
		);
	}
	return literal;
}

export function resolveWorkgroupSize(
	compute: string,
	explicitWorkgroupSize?: ComputeWorkgroupSize
): [number, number, number] {
	const { literal } = analyzeWorkgroupSize(compute);

	if (!explicitWorkgroupSize) {
		if (!literal) {
			throw new Error(
				'Could not extract @workgroup_size as a literal from compute shader source. ' +
					'Pass an explicit workgroupSize option when the attribute uses an override or constant expression.'
			);
		}
		return literal;
	}
	const explicit = normalizeExplicitWorkgroupSize(explicitWorkgroupSize);
	if (literal && literal.some((value, index) => value !== explicit[index])) {
		throw new Error(
			`Explicit workgroupSize ${explicit.join('x')} does not match literal @workgroup_size ${literal.join('x')}.`
		);
	}
	return literal ?? explicit;
}

function buildUniformStructForCompute(layout: UniformLayout): string {
	if (layout.entries.length === 0) return DEFAULT_UNIFORM_FIELD;
	return layout.entries.map((entry) => `${entry.name}: ${entry.type},`).join('\n\t');
}

function assertBindingOrder(resources: readonly ResolvedComputeShaderBinding[]): void {
	for (let index = 0; index < resources.length; index += 1) {
		const resource = resources[index];
		if (!resource || resource.binding !== index) {
			throw new Error(
				`Resolved compute shader resources must use contiguous binding order; expected binding ${index}.`
			);
		}
	}
}

/**
 * Emits the heterogeneous group 1 declarations from the resolver-owned order.
 */
export function buildComputeResourceBindings(
	resources: readonly ResolvedComputeShaderBinding[]
): string {
	assertBindingOrder(resources);
	return resources
		.map((resource) => {
			switch (resource.kind) {
				case 'sampled-texture':
					return `@group(1) @binding(${resource.binding}) var ${resource.alias}: texture_2d<${resource.scalarType}>;`;
				case 'storage-texture':
					return `@group(1) @binding(${resource.binding}) var ${resource.alias}: texture_storage_2d<${resource.format}, write>;`;
				case 'storage-buffer':
					return `@group(1) @binding(${resource.binding}) var<storage, ${resource.access === 'storage-read' ? 'read' : 'read_write'}> ${resource.alias}: ${resource.wgslType};`;
				case 'sampler':
					return `@group(1) @binding(${resource.binding}) var ${resource.alias}: ${resource.samplerType === 'comparison' ? 'sampler_comparison' : 'sampler'};`;
				default: {
					const unsupportedKind = (resource as { kind: unknown }).kind;
					resource satisfies never;
					throw new Error(
						`Unsupported resolved compute shader resource kind: ${String(unsupportedKind)}`
					);
				}
			}
		})
		.join('\n');
}

/** Maps storage texture format to sampled `texture_2d<T>` scalar type. */
export function storageTextureSampleScalarType(format: GPUTextureFormat): 'f32' | 'u32' | 'i32' {
	const scalarType = textureSampleScalarType(format);
	return scalarType === 'u32' || scalarType === 'i32' ? scalarType : 'f32';
}

export function buildComputeShaderSource(options: BuildComputeShaderSourceOptions): string {
	const uniformFields = buildUniformStructForCompute(options.uniformLayout);
	const resourceBindings = buildComputeResourceBindings(options.resources);

	return `struct SpektralFrame {
	time: f32,
	delta: f32,
	resolution: vec2f,
};

struct SpektralUniforms {
	${uniformFields}
};

@group(0) @binding(0) var<uniform> spektralFrame: SpektralFrame;
@group(0) @binding(1) var<uniform> spektralUniforms: SpektralUniforms;
${resourceBindings ? '\n' + resourceBindings : ''}

${options.compute}
`;
}

function buildComputeLineMap(
	generatedCode: string,
	userComputeSource: string
): ComputeShaderLineMap {
	const lineCount = generatedCode.split('\n').length;
	const lineMap: ComputeShaderLineMap = new Array(lineCount + 1).fill(null);
	const computeStartIndex = generatedCode.indexOf(userComputeSource);
	if (computeStartIndex === -1) return lineMap;

	const computeStartLine = generatedCode.slice(0, computeStartIndex).split('\n').length;
	const computeLineCount = userComputeSource.split('\n').length;
	for (let line = 0; line < computeLineCount; line += 1) {
		lineMap[computeStartLine + line] = { kind: 'compute', line: line + 1 };
	}
	return lineMap;
}

/** The renderer's only compute WGSL generation path. */
export function buildComputeShaderSourceWithMap(
	options: BuildComputeShaderSourceOptions
): BuiltComputeShaderSource {
	const code = buildComputeShaderSource(options);
	return { code, lineMap: buildComputeLineMap(code, options.compute) };
}
