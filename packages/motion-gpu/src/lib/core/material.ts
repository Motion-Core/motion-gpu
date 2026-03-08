import { normalizeTextureDefinition } from './textures';
import type { MaterialSourceMetadata } from './error-diagnostics';
import {
	assertUniformName,
	assertUniformValueForType,
	inferUniformType,
	resolveUniformLayout
} from './uniforms';
import {
	normalizeDefines,
	normalizeIncludes,
	preprocessMaterialFragment,
	toDefineLine,
	type MaterialLineMap,
	type PreprocessedMaterialFragment
} from './material-preprocess';
import type {
	TextureData,
	TextureDefinition,
	TextureDefinitionMap,
	TextureValue,
	TypedUniform,
	UniformMap,
	UniformValue
} from './types';

/**
 * Typed compile-time define declaration.
 */
export interface TypedMaterialDefineValue {
	/**
	 * WGSL scalar type.
	 */
	type: 'bool' | 'f32' | 'i32' | 'u32';
	/**
	 * Literal value for the selected WGSL type.
	 */
	value: boolean | number;
}

/**
 * Allowed value types for WGSL `const` define injection.
 */
export type MaterialDefineValue = boolean | number | TypedMaterialDefineValue;

/**
 * Define map keyed by uniform-compatible identifier names.
 */
export type MaterialDefines = Record<string, MaterialDefineValue>;

/**
 * Include map keyed by include identifier used in `#include <name>` directives.
 */
export type MaterialIncludes = Record<string, string>;

/**
 * External material input accepted by {@link defineMaterial}.
 */
export interface FragMaterialInput {
	/**
	 * User WGSL source containing `frag(uv: vec2f) -> vec4f`.
	 */
	fragment: string;
	/**
	 * Initial uniform values.
	 */
	uniforms?: UniformMap;
	/**
	 * Texture definitions keyed by texture uniform name.
	 */
	textures?: TextureDefinitionMap;
	/**
	 * Optional compile-time define constants injected into WGSL.
	 */
	defines?: MaterialDefines;
	/**
	 * Optional WGSL include chunks used by `#include <name>` directives.
	 */
	includes?: MaterialIncludes;
}

/**
 * Normalized and immutable material declaration consumed by `FragCanvas`.
 */
export interface FragMaterial {
	/**
	 * User WGSL source containing `frag(uv: vec2f) -> vec4f`.
	 */
	readonly fragment: string;
	/**
	 * Initial uniform values.
	 */
	readonly uniforms: Readonly<UniformMap>;
	/**
	 * Texture definitions keyed by texture uniform name.
	 */
	readonly textures: Readonly<TextureDefinitionMap>;
	/**
	 * Optional compile-time define constants injected into WGSL.
	 */
	readonly defines: Readonly<MaterialDefines>;
	/**
	 * Optional WGSL include chunks used by `#include <name>` directives.
	 */
	readonly includes: Readonly<MaterialIncludes>;
}

/**
 * Fully resolved, immutable material snapshot used for renderer creation/caching.
 */
export interface ResolvedMaterial {
	/**
	 * Final fragment WGSL after define injection.
	 */
	fragmentWgsl: string;
	/**
	 * 1-based map from generated fragment lines to user source lines.
	 */
	fragmentLineMap: MaterialLineMap;
	/**
	 * Cloned uniforms.
	 */
	uniforms: UniformMap;
	/**
	 * Cloned texture definitions.
	 */
	textures: TextureDefinitionMap;
	/**
	 * Resolved packed uniform layout.
	 */
	uniformLayout: ReturnType<typeof resolveUniformLayout>;
	/**
	 * Sorted texture keys.
	 */
	textureKeys: string[];
	/**
	 * Deterministic JSON signature for cache invalidation.
	 */
	signature: string;
	/**
	 * Original user fragment source before preprocessing.
	 */
	fragmentSource: string;
	/**
	 * Normalized include sources map.
	 */
	includeSources: MaterialIncludes;
	/**
	 * Deterministic define block source used for diagnostics mapping.
	 */
	defineBlockSource: string;
	/**
	 * Source metadata used for diagnostics.
	 */
	source: Readonly<MaterialSourceMetadata> | null;
}

/**
 * Strict fragment contract used by MotionGPU.
 */
const FRAGMENT_FUNCTION_SIGNATURE_PATTERN =
	/\bfn\s+frag\s*\(\s*([^)]*?)\s*\)\s*->\s*([A-Za-z_][A-Za-z0-9_<>\s]*)\s*(?:\{|$)/m;
const FRAGMENT_FUNCTION_NAME_PATTERN = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * Cache of resolved material snapshots keyed by immutable material instance.
 */
const resolvedMaterialCache = new WeakMap<FragMaterial, ResolvedMaterial>();
const preprocessedFragmentCache = new WeakMap<FragMaterial, PreprocessedMaterialFragment>();
const materialSourceMetadataCache = new WeakMap<FragMaterial, MaterialSourceMetadata | null>();

const STACK_TRACE_CHROME_PATTERN = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/;
const STACK_TRACE_FIREFOX_PATTERN = /^(.*?)@(.+?):(\d+):(\d+)$/;

function getPathBasename(path: string): string {
	const normalized = path.split(/[?#]/)[0] ?? path;
	const parts = normalized.split(/[\\/]/);
	const last = parts[parts.length - 1];
	return last && last.length > 0 ? last : path;
}

function normalizeSignaturePart(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function listFunctionNames(fragment: string): string[] {
	const names = new Set<string>();
	for (const match of fragment.matchAll(FRAGMENT_FUNCTION_NAME_PATTERN)) {
		const name = match[1];
		if (!name) {
			continue;
		}
		names.add(name);
	}

	return Array.from(names);
}

function captureMaterialSourceFromStack(): MaterialSourceMetadata | null {
	const stack = new Error().stack;
	if (!stack) {
		return null;
	}

	const stackLines = stack.split('\n').slice(1);
	for (const rawLine of stackLines) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}

		const chromeMatch = line.match(STACK_TRACE_CHROME_PATTERN);
		const firefoxMatch = line.match(STACK_TRACE_FIREFOX_PATTERN);
		const functionName = chromeMatch?.[1] ?? firefoxMatch?.[1] ?? undefined;
		const file = chromeMatch?.[2] ?? firefoxMatch?.[2];
		const lineValue = chromeMatch?.[3] ?? firefoxMatch?.[3];
		const columnValue = chromeMatch?.[4] ?? firefoxMatch?.[4];

		if (!file || !lineValue || !columnValue) {
			continue;
		}

		if (file.includes('/core/material') || file.includes('\\core\\material')) {
			continue;
		}

		const parsedLine = Number.parseInt(lineValue, 10);
		const parsedColumn = Number.parseInt(columnValue, 10);
		if (!Number.isFinite(parsedLine) || !Number.isFinite(parsedColumn)) {
			continue;
		}

		return {
			component: getPathBasename(file),
			file,
			line: parsedLine,
			column: parsedColumn,
			...(functionName ? { functionName } : {})
		};
	}

	return null;
}

function resolveSourceMetadata(
	source: MaterialSourceMetadata | undefined
): MaterialSourceMetadata | null {
	const captured = captureMaterialSourceFromStack();
	const component = source?.component ?? captured?.component;
	const file = source?.file ?? captured?.file;
	const line = source?.line ?? captured?.line;
	const column = source?.column ?? captured?.column;
	const functionName = source?.functionName ?? captured?.functionName;

	if (
		component === undefined &&
		file === undefined &&
		line === undefined &&
		column === undefined &&
		functionName === undefined
	) {
		return null;
	}

	return {
		...(component !== undefined ? { component } : {}),
		...(file !== undefined ? { file } : {}),
		...(line !== undefined ? { line } : {}),
		...(column !== undefined ? { column } : {}),
		...(functionName !== undefined ? { functionName } : {})
	};
}

/**
 * Asserts that material has been normalized by {@link defineMaterial}.
 */
function assertDefinedMaterial(material: FragMaterial): void {
	if (
		!Object.isFrozen(material) ||
		!material.uniforms ||
		!material.textures ||
		!material.defines ||
		!material.includes
	) {
		throw new Error(
			'Invalid material instance. Create materials with defineMaterial(...) before passing them to <FragCanvas>.'
		);
	}
}

/**
 * Clones uniform value input to decouple material instances from external objects.
 */
function cloneUniformValue(value: UniformValue): UniformValue {
	if (typeof value === 'number') {
		return value;
	}

	if (Array.isArray(value)) {
		return Object.freeze([...value]) as UniformValue;
	}

	if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value) {
		const typed = value as TypedUniform;
		const typedValue = typed.value as unknown;

		let clonedTypedValue = typedValue;
		if (typedValue instanceof Float32Array) {
			clonedTypedValue = new Float32Array(typedValue);
		} else if (Array.isArray(typedValue)) {
			clonedTypedValue = Object.freeze([...typedValue]);
		}

		return Object.freeze({
			type: typed.type,
			value: clonedTypedValue
		}) as UniformValue;
	}

	return value;
}

/**
 * Clones optional texture value payload.
 */
function cloneTextureValue(value: TextureValue | undefined): TextureValue {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value === 'object' && 'source' in value) {
		const data = value as TextureData;
		return {
			source: data.source,
			...(data.width !== undefined ? { width: data.width } : {}),
			...(data.height !== undefined ? { height: data.height } : {}),
			...(data.colorSpace !== undefined ? { colorSpace: data.colorSpace } : {}),
			...(data.flipY !== undefined ? { flipY: data.flipY } : {}),
			...(data.premultipliedAlpha !== undefined
				? { premultipliedAlpha: data.premultipliedAlpha }
				: {}),
			...(data.generateMipmaps !== undefined ? { generateMipmaps: data.generateMipmaps } : {}),
			...(data.update !== undefined ? { update: data.update } : {})
		};
	}

	return value;
}

/**
 * Clones and validates fragment source contract.
 */
function resolveFragment(fragment: string): string {
	if (typeof fragment !== 'string' || fragment.trim().length === 0) {
		throw new Error('Material fragment shader must be a non-empty WGSL string.');
	}

	const signature = fragment.match(FRAGMENT_FUNCTION_SIGNATURE_PATTERN);
	if (!signature) {
		const discoveredFunctions = listFunctionNames(fragment).slice(0, 4);
		const discoveredLabel =
			discoveredFunctions.length > 0
				? `Found: ${discoveredFunctions.map((name) => `\`${name}(...)\``).join(', ')}.`
				: 'No WGSL function declarations were found.';

		throw new Error(
			`Material fragment contract mismatch: missing entrypoint \`fn frag(uv: vec2f) -> vec4f\`. ${discoveredLabel}`
		);
	}

	const params = normalizeSignaturePart(signature[1] ?? '');
	const returnType = normalizeSignaturePart(signature[2] ?? '');

	if (params !== 'uv: vec2f') {
		throw new Error(
			`Material fragment contract mismatch for \`frag\`: expected parameter list \`(uv: vec2f)\`, received \`(${params || '...'})\`.`
		);
	}

	if (returnType !== 'vec4f') {
		throw new Error(
			`Material fragment contract mismatch for \`frag\`: expected return type \`vec4f\`, received \`${returnType}\`.`
		);
	}

	return fragment;
}

/**
 * Clones and validates uniform declarations.
 */
function resolveUniforms(uniforms: UniformMap | undefined): UniformMap {
	const resolved: UniformMap = {};

	for (const [name, value] of Object.entries(uniforms ?? {})) {
		assertUniformName(name);
		const clonedValue = cloneUniformValue(value as UniformValue);
		const type = inferUniformType(clonedValue);
		assertUniformValueForType(type, clonedValue);
		resolved[name] = clonedValue;
	}

	resolveUniformLayout(resolved);
	return resolved;
}

/**
 * Clones and validates texture declarations.
 */
function resolveTextures(textures: TextureDefinitionMap | undefined): TextureDefinitionMap {
	const resolved: TextureDefinitionMap = {};

	for (const [name, definition] of Object.entries(textures ?? {})) {
		assertUniformName(name);

		const clonedDefinition: TextureDefinition = {
			...(definition ?? {}),
			source: cloneTextureValue(definition?.source)
		};

		resolved[name] = Object.freeze(clonedDefinition);
	}

	return resolved;
}

/**
 * Clones and validates define declarations.
 */
function resolveDefines(defines: MaterialDefines | undefined): MaterialDefines {
	return normalizeDefines(defines);
}

/**
 * Clones and validates include declarations.
 */
function resolveIncludes(includes: MaterialIncludes | undefined): MaterialIncludes {
	return normalizeIncludes(includes);
}

/**
 * Builds a deterministic texture-config signature map used in material cache signatures.
 *
 * @param textures - Raw texture definitions from material input.
 * @param textureKeys - Sorted texture keys.
 * @returns Compact signature entries describing effective texture config per key.
 */
function buildTextureConfigSignature(
	textures: TextureDefinitionMap,
	textureKeys: string[]
): Record<string, string> {
	const signature: Record<string, string> = {};

	for (const key of textureKeys) {
		const normalized = normalizeTextureDefinition(textures[key]);
		signature[key] = [
			normalized.colorSpace,
			normalized.flipY ? '1' : '0',
			normalized.generateMipmaps ? '1' : '0',
			normalized.premultipliedAlpha ? '1' : '0',
			normalized.anisotropy,
			normalized.filter,
			normalized.addressModeU,
			normalized.addressModeV
		].join(':');
	}

	return signature;
}

/**
 * Creates a stable WGSL define block from the provided map.
 *
 * @param defines - Optional material defines.
 * @returns Joined WGSL const declarations ordered by key.
 */
export function buildDefinesBlock(defines: MaterialDefines | undefined): string {
	const normalizedDefines = normalizeDefines(defines);
	if (Object.keys(normalizedDefines).length === 0) {
		return '';
	}

	return Object.entries(normalizedDefines)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => {
			assertUniformName(key);
			return toDefineLine(key, value);
		})
		.join('\n');
}

/**
 * Prepends resolved defines to a fragment shader.
 *
 * @param fragment - Raw WGSL fragment source.
 * @param defines - Optional define map.
 * @returns Fragment source with a leading define block when defines are present.
 */
export function applyMaterialDefines(
	fragment: string,
	defines: MaterialDefines | undefined
): string {
	const defineBlock = buildDefinesBlock(defines);
	if (defineBlock.length === 0) {
		return fragment;
	}

	return `${defineBlock}\n\n${fragment}`;
}

/**
 * Creates an immutable material object with validated shader/uniform/texture contracts.
 *
 * @param input - User material declaration.
 * @returns Frozen material object safe to share and cache.
 */
export function defineMaterial(input: FragMaterialInput): FragMaterial {
	const fragment = resolveFragment(input.fragment);
	const uniforms = Object.freeze(resolveUniforms(input.uniforms));
	const textures = Object.freeze(resolveTextures(input.textures));
	const defines = Object.freeze(resolveDefines(input.defines));
	const includes = Object.freeze(resolveIncludes(input.includes));
	const source = Object.freeze(resolveSourceMetadata(undefined));

	const preprocessed = preprocessMaterialFragment({
		fragment,
		defines: defines as MaterialDefines,
		includes: includes as MaterialIncludes
	});

	const material = Object.freeze({
		fragment,
		uniforms,
		textures,
		defines,
		includes
	});

	preprocessedFragmentCache.set(material, preprocessed);
	materialSourceMetadataCache.set(material, source);
	return material;
}

/**
 * Resolves a material to renderer-ready data and a deterministic signature.
 *
 * @param material - Material input created via {@link defineMaterial}.
 * @returns Resolved material with packed uniform layout, sorted texture keys and cache signature.
 */
export function resolveMaterial(material: FragMaterial): ResolvedMaterial {
	assertDefinedMaterial(material);

	const cached = resolvedMaterialCache.get(material);
	if (cached) {
		return cached;
	}

	const uniforms = material.uniforms as UniformMap;
	const textures = material.textures as TextureDefinitionMap;
	const uniformLayout = resolveUniformLayout(uniforms);
	const textureKeys = Object.keys(textures).sort();
	const preprocessed =
		preprocessedFragmentCache.get(material) ??
		preprocessMaterialFragment({
			fragment: material.fragment,
			defines: material.defines as MaterialDefines,
			includes: material.includes as MaterialIncludes
		});
	const fragmentWgsl = preprocessed.fragment;
	const textureConfig = buildTextureConfigSignature(textures, textureKeys);

	const signature = JSON.stringify({
		fragmentWgsl,
		uniforms: uniformLayout.entries.map((entry) => `${entry.name}:${entry.type}`),
		textureKeys,
		textureConfig
	});

	const resolved: ResolvedMaterial = {
		fragmentWgsl,
		fragmentLineMap: preprocessed.lineMap,
		uniforms,
		textures,
		uniformLayout,
		textureKeys,
		signature,
		fragmentSource: material.fragment,
		includeSources: material.includes as MaterialIncludes,
		defineBlockSource: preprocessed.defineBlockSource,
		source: materialSourceMetadataCache.get(material) ?? null
	};

	resolvedMaterialCache.set(material, resolved);
	return resolved;
}
