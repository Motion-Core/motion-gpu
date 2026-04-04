import type { StorageBufferAccess, StorageBufferType, UniformLayout } from './types.js';

/**
 * Regex contract for compute entrypoint.
 * Matches: @compute @workgroup_size(...) fn compute(
 * with @builtin(global_invocation_id) parameter.
 */
export const COMPUTE_ENTRY_CONTRACT = /@compute\s+@workgroup_size\s*\([^)]+\)\s*fn\s+compute\s*\(/;

/**
 * Regex to extract @workgroup_size values.
 */
const WORKGROUP_SIZE_PATTERN =
	/@workgroup_size\s*\(\s*(\d+)(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\s*\)/;

/**
 * Regex to verify @builtin(global_invocation_id) parameter.
 */
const GLOBAL_INVOCATION_ID_PATTERN = /@builtin\s*\(\s*global_invocation_id\s*\)/;
const WORKGROUP_DIMENSION_MIN = 1;
const WORKGROUP_DIMENSION_MAX = 65535;

function extractComputeParamList(compute: string): string | null {
	const computeFnIndex = compute.indexOf('fn compute');
	if (computeFnIndex === -1) {
		return null;
	}

	const openParenIndex = compute.indexOf('(', computeFnIndex);
	if (openParenIndex === -1) {
		return null;
	}

	let depth = 0;
	for (let index = openParenIndex; index < compute.length; index += 1) {
		const char = compute[index];
		if (char === '(') {
			depth += 1;
			continue;
		}

		if (char === ')') {
			depth -= 1;
			if (depth === 0) {
				return compute.slice(openParenIndex + 1, index);
			}
		}
	}

	return null;
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

/**
 * Default uniform field used when no custom uniforms are provided in compute.
 */
const DEFAULT_UNIFORM_FIELD = 'motiongpu_unused: vec4f,';

/**
 * Validates compute shader user code matches the compute contract.
 *
 * @param compute - User compute shader WGSL source.
 * @throws {Error} When shader does not match the compute contract.
 */
export function assertComputeContract(compute: string): void {
	if (!COMPUTE_ENTRY_CONTRACT.test(compute)) {
		throw new Error(
			'Compute shader must declare `@compute @workgroup_size(...) fn compute(...)`. ' +
				'Ensure the function is named `compute` and includes @compute and @workgroup_size annotations.'
		);
	}

	const params = extractComputeParamList(compute);
	if (!params || !GLOBAL_INVOCATION_ID_PATTERN.test(params)) {
		throw new Error('Compute shader must include a `@builtin(global_invocation_id)` parameter.');
	}

	extractWorkgroupSize(compute);
}

/**
 * Extracts @workgroup_size values from WGSL compute shader.
 *
 * @param compute - Validated compute shader source.
 * @returns Tuple [x, y, z] with defaults of 1 for omitted dimensions.
 */
export function extractWorkgroupSize(compute: string): [number, number, number] {
	const match = compute.match(WORKGROUP_SIZE_PATTERN);
	if (!match) {
		throw new Error('Could not extract @workgroup_size from compute shader source.');
	}

	const x = Number.parseInt(match[1] ?? '1', 10);
	const y = Number.parseInt(match[2] ?? '1', 10);
	const z = Number.parseInt(match[3] ?? '1', 10);
	assertWorkgroupDimension(x);
	assertWorkgroupDimension(y);
	assertWorkgroupDimension(z);

	return [x, y, z];
}

/**
 * Maps StorageBufferAccess to WGSL var qualifier.
 */
function toWgslAccessMode(access: StorageBufferAccess): string {
	switch (access) {
		case 'read':
			return 'read';
		case 'read-write':
			return 'read_write';
		default:
			throw new Error(`Unsupported storage buffer access mode "${String(access)}".`);
	}
}

/**
 * Builds WGSL struct fields for uniforms used in compute shader preamble.
 */
function buildUniformStructForCompute(layout: UniformLayout): string {
	if (layout.entries.length === 0) {
		return DEFAULT_UNIFORM_FIELD;
	}

	return layout.entries.map((entry) => `${entry.name}: ${entry.type},`).join('\n\t');
}

/**
 * Builds storage buffer binding declarations for compute shader.
 *
 * @param storageBufferKeys - Sorted buffer keys.
 * @param definitions - Type/access definitions per key.
 * @param groupIndex - Bind group index for storage buffers.
 * @returns WGSL binding declaration string.
 */
export function buildComputeStorageBufferBindings(
	storageBufferKeys: string[],
	definitions: Record<string, { type: StorageBufferType; access: StorageBufferAccess }>,
	groupIndex: number
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

		const accessMode = toWgslAccessMode(definition.access);
		declarations.push(
			`@group(${groupIndex}) @binding(${index}) var<storage, ${accessMode}> ${key}: ${definition.type};`
		);
	}

	return declarations.join('\n');
}

/**
 * Builds storage texture binding declarations for compute shader.
 *
 * @param storageTextureKeys - Sorted storage texture keys.
 * @param definitions - Format definitions per key.
 * @param groupIndex - Bind group index for storage textures.
 * @returns WGSL binding declaration string.
 */
export function buildComputeStorageTextureBindings(
	storageTextureKeys: string[],
	definitions: Record<string, { format: GPUTextureFormat }>,
	groupIndex: number
): string {
	if (storageTextureKeys.length === 0) {
		return '';
	}

	const declarations: string[] = [];

	for (let index = 0; index < storageTextureKeys.length; index += 1) {
		const key = storageTextureKeys[index];
		if (key === undefined) {
			continue;
		}

		const definition = definitions[key];
		if (!definition) {
			continue;
		}

		declarations.push(
			`@group(${groupIndex}) @binding(${index}) var ${key}: texture_storage_2d<${definition.format}, write>;`
		);
	}

	return declarations.join('\n');
}

/**
 * Maps storage texture format to sampled texture scalar type for `texture_2d<T>`.
 */
export function storageTextureSampleScalarType(format: GPUTextureFormat): 'f32' | 'u32' | 'i32' {
	const normalized = String(format).toLowerCase();
	if (normalized.endsWith('uint')) {
		return 'u32';
	}
	if (normalized.endsWith('sint')) {
		return 'i32';
	}
	return 'f32';
}

/**
 * Assembles compute shader WGSL for ping-pong workflows.
 *
 * Exposes two generated bindings under group(2):
 * - `${target}A`: sampled read texture (`texture_2d<T>`)
 * - `${target}B`: storage write texture (`texture_storage_2d<format, write>`)
 */
export function buildPingPongComputeShaderSource(options: {
	compute: string;
	uniformLayout: UniformLayout;
	storageBufferKeys: string[];
	storageBufferDefinitions: Record<
		string,
		{ type: StorageBufferType; access: StorageBufferAccess }
	>;
	target: string;
	targetFormat: GPUTextureFormat;
}): string {
	const uniformFields = buildUniformStructForCompute(options.uniformLayout);
	const storageBufferBindings = buildComputeStorageBufferBindings(
		options.storageBufferKeys,
		options.storageBufferDefinitions,
		1
	);
	const sampledType = storageTextureSampleScalarType(options.targetFormat);
	const pingPongTextureBindings = [
		`@group(2) @binding(0) var ${options.target}A: texture_2d<${sampledType}>;`,
		`@group(2) @binding(1) var ${options.target}B: texture_storage_2d<${options.targetFormat}, write>;`
	].join('\n');

	return `struct MotionGPUFrame {
	time: f32,
	delta: f32,
	resolution: vec2f,
};

struct MotionGPUUniforms {
	${uniformFields}
};

@group(0) @binding(0) var<uniform> motiongpuFrame: MotionGPUFrame;
@group(0) @binding(1) var<uniform> motiongpuUniforms: MotionGPUUniforms;
${storageBufferBindings ? '\n' + storageBufferBindings : ''}
${pingPongTextureBindings ? '\n' + pingPongTextureBindings : ''}

${options.compute}
`;
}

/**
 * Source location for generated compute shader lines.
 */
export interface ComputeShaderSourceLocation {
	kind: 'compute';
	line: number;
}

/**
 * 1-based line map from generated compute WGSL to user compute source.
 */
export type ComputeShaderLineMap = Array<ComputeShaderSourceLocation | null>;

/**
 * Result of compute shader source generation with line mapping metadata.
 */
export interface BuiltComputeShaderSource {
	code: string;
	lineMap: ComputeShaderLineMap;
}

/**
 * Assembles full compute shader WGSL with preamble.
 *
 * @param options - Compute shader build options.
 * @returns Complete WGSL source for compute stage.
 */
export function buildComputeShaderSource(options: {
	compute: string;
	uniformLayout: UniformLayout;
	storageBufferKeys: string[];
	storageBufferDefinitions: Record<
		string,
		{ type: StorageBufferType; access: StorageBufferAccess }
	>;
	storageTextureKeys: string[];
	storageTextureDefinitions: Record<string, { format: GPUTextureFormat }>;
}): string {
	const uniformFields = buildUniformStructForCompute(options.uniformLayout);
	const storageBufferBindings = buildComputeStorageBufferBindings(
		options.storageBufferKeys,
		options.storageBufferDefinitions,
		1
	);
	const storageTextureBindings = buildComputeStorageTextureBindings(
		options.storageTextureKeys,
		options.storageTextureDefinitions,
		2
	);

	return `struct MotionGPUFrame {
	time: f32,
	delta: f32,
	resolution: vec2f,
};

struct MotionGPUUniforms {
	${uniformFields}
};

@group(0) @binding(0) var<uniform> motiongpuFrame: MotionGPUFrame;
@group(0) @binding(1) var<uniform> motiongpuUniforms: MotionGPUUniforms;
${storageBufferBindings ? '\n' + storageBufferBindings : ''}
${storageTextureBindings ? '\n' + storageTextureBindings : ''}

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
	if (computeStartIndex === -1) {
		return lineMap;
	}

	const computeStartLine = generatedCode.slice(0, computeStartIndex).split('\n').length;
	const computeLineCount = userComputeSource.split('\n').length;
	for (let line = 0; line < computeLineCount; line += 1) {
		lineMap[computeStartLine + line] = {
			kind: 'compute',
			line: line + 1
		};
	}

	return lineMap;
}

/**
 * Assembles full compute shader WGSL with source line mapping metadata.
 */
export function buildComputeShaderSourceWithMap(options: {
	compute: string;
	uniformLayout: UniformLayout;
	storageBufferKeys: string[];
	storageBufferDefinitions: Record<
		string,
		{ type: StorageBufferType; access: StorageBufferAccess }
	>;
	storageTextureKeys: string[];
	storageTextureDefinitions: Record<string, { format: GPUTextureFormat }>;
}): BuiltComputeShaderSource {
	const code = buildComputeShaderSource(options);
	return {
		code,
		lineMap: buildComputeLineMap(code, options.compute)
	};
}

/**
 * Assembles ping-pong compute shader WGSL with source line mapping metadata.
 */
export function buildPingPongComputeShaderSourceWithMap(options: {
	compute: string;
	uniformLayout: UniformLayout;
	storageBufferKeys: string[];
	storageBufferDefinitions: Record<
		string,
		{ type: StorageBufferType; access: StorageBufferAccess }
	>;
	target: string;
	targetFormat: GPUTextureFormat;
}): BuiltComputeShaderSource {
	const code = buildPingPongComputeShaderSource(options);
	return {
		code,
		lineMap: buildComputeLineMap(code, options.compute)
	};
}
