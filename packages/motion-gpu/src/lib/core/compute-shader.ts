import type { StorageBufferType, UniformLayout } from './types.js';

/**
 * Regex contract for the single public compute entrypoint.
 *
 * Keep the workgroup-size grammar aligned with `extractWorkgroupSize` so a
 * malformed attribute cannot make the expression scan across later attributes.
 */
export const COMPUTE_ENTRY_CONTRACT =
	/@compute\s+@workgroup_size\s*\(\s*\d+(?:\s*,\s*\d+){0,2}\s*\)\s*fn\s+compute\s*\(/;

const WORKGROUP_SIZE_PATTERN =
	/@workgroup_size\s*\(\s*(\d+)(?:\s*,\s*(\d+))?(?:\s*,\s*(\d+))?\s*\)/;
const GLOBAL_INVOCATION_ID_PATTERN = /@builtin\s*\(\s*global_invocation_id\s*\)/;
const WORKGROUP_DIMENSION_MIN = 1;
const WORKGROUP_DIMENSION_MAX = 65535;
const DEFAULT_UNIFORM_FIELD = 'motiongpu_unused: vec4f,';

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

function extractComputeParamList(compute: string): string | null {
	const entrypoint = COMPUTE_ENTRY_CONTRACT.exec(compute);
	if (!entrypoint) return null;
	const openParenIndex = entrypoint.index + entrypoint[0].length - 1;

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

export function extractWorkgroupSize(compute: string): [number, number, number] {
	const match = compute.match(WORKGROUP_SIZE_PATTERN);
	if (!match) throw new Error('Could not extract @workgroup_size from compute shader source.');

	const x = Number.parseInt(match[1] ?? '1', 10);
	const y = Number.parseInt(match[2] ?? '1', 10);
	const z = Number.parseInt(match[3] ?? '1', 10);
	assertWorkgroupDimension(x);
	assertWorkgroupDimension(y);
	assertWorkgroupDimension(z);
	return [x, y, z];
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
	const normalized = String(format).toLowerCase();
	if (normalized.endsWith('uint')) return 'u32';
	if (normalized.endsWith('sint')) return 'i32';
	return 'f32';
}

export function buildComputeShaderSource(options: BuildComputeShaderSourceOptions): string {
	const uniformFields = buildUniformStructForCompute(options.uniformLayout);
	const resourceBindings = buildComputeResourceBindings(options.resources);

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
