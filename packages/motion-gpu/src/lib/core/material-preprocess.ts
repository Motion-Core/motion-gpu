import { assertUniformName } from './uniforms.js';
import type {
	MaterialDefines,
	MaterialDefineVectorType,
	MaterialDefineValue,
	MaterialIncludes,
	MaterialLineMap,
	MaterialSourceLocation,
	PreprocessedMaterialFragment,
	TypedMaterialDefineValue
} from './material-contracts.js';
export type {
	MaterialLineMap,
	MaterialSourceLocation,
	PreprocessedMaterialFragment
} from './material-contracts.js';

const INCLUDE_DIRECTIVE_PATTERN = /^\s*#include\s+<([A-Za-z_][A-Za-z0-9_]*)>\s*$/;
const DEFINE_VECTOR_LENGTHS: Record<MaterialDefineVectorType, number> = {
	vec2f: 2,
	vec3f: 3,
	vec4f: 4
};

function normalizeTypedDefine(
	name: string,
	define: TypedMaterialDefineValue
): TypedMaterialDefineValue {
	const value = define.value;

	if (define.type === 'bool') {
		if (typeof value !== 'boolean') {
			throw new Error(`Invalid define value for "${name}". bool define requires boolean value.`);
		}

		return {
			type: 'bool',
			value
		};
	}

	if (define.type === 'vec2f' || define.type === 'vec3f' || define.type === 'vec4f') {
		const expectedLength = DEFINE_VECTOR_LENGTHS[define.type];
		if (
			!Array.isArray(value) ||
			value.length !== expectedLength ||
			!value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
		) {
			throw new Error(
				`Invalid define value for "${name}". ${define.type} define requires a tuple with ${expectedLength} finite numbers.`
			);
		}

		return {
			type: define.type,
			value: Object.freeze([...value]) as TypedMaterialDefineValue['value']
		} as TypedMaterialDefineValue;
	}

	if (define.type !== 'f32' && define.type !== 'i32' && define.type !== 'u32') {
		throw new Error(`Invalid define value for "${name}". Unsupported define type.`);
	}

	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`Invalid define value for "${name}". Numeric define must be finite.`);
	}

	if ((define.type === 'i32' || define.type === 'u32') && !Number.isInteger(value)) {
		throw new Error(`Invalid define value for "${name}". ${define.type} define requires integer.`);
	}

	if (define.type === 'u32' && value < 0) {
		throw new Error(`Invalid define value for "${name}". u32 define must be >= 0.`);
	}

	return {
		type: define.type,
		value
	};
}

function toF32Literal(value: number): string {
	return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function toVectorDefineLine(
	key: string,
	type: MaterialDefineVectorType,
	value: readonly number[]
): string {
	const literals = value.map(toF32Literal).join(', ');
	return `const ${key}: ${type} = ${type}(${literals});`;
}

/**
 * Validates and normalizes define entries.
 */
export function normalizeDefines<TDefineKey extends string>(
	defines: MaterialDefines<TDefineKey> | undefined
): MaterialDefines<TDefineKey> {
	const resolved: MaterialDefines<TDefineKey> = {} as MaterialDefines<TDefineKey>;

	for (const [name, value] of Object.entries(defines ?? {}) as Array<
		[TDefineKey, MaterialDefineValue]
	>) {
		assertUniformName(name);

		if (typeof value === 'boolean') {
			resolved[name] = value;
			continue;
		}

		if (typeof value === 'number') {
			if (!Number.isFinite(value)) {
				throw new Error(`Invalid define value for "${name}". Define numbers must be finite.`);
			}
			resolved[name] = value;
			continue;
		}

		const normalized = normalizeTypedDefine(name, value);
		resolved[name] = Object.freeze(normalized);
	}

	return resolved;
}

/**
 * Validates include map identifiers and source chunks.
 */
export function normalizeIncludes<TIncludeKey extends string>(
	includes: MaterialIncludes<TIncludeKey> | undefined
): MaterialIncludes<TIncludeKey> {
	const resolved: MaterialIncludes<TIncludeKey> = {} as MaterialIncludes<TIncludeKey>;

	for (const [name, source] of Object.entries(includes ?? {}) as Array<[TIncludeKey, string]>) {
		assertUniformName(name);
		if (typeof source !== 'string' || source.trim().length === 0) {
			throw new Error(`Invalid include "${name}". Include source must be a non-empty WGSL string.`);
		}
		resolved[name] = source;
	}

	return resolved;
}

/**
 * Converts one define declaration to WGSL `const`.
 */
export function toDefineLine(key: string, value: MaterialDefineValue): string {
	if (typeof value === 'boolean') {
		return `const ${key}: bool = ${value ? 'true' : 'false'};`;
	}

	if (typeof value === 'number') {
		return `const ${key}: f32 = ${toF32Literal(value)};`;
	}

	switch (value.type) {
		case 'bool':
			return `const ${key}: bool = ${value.value ? 'true' : 'false'};`;
		case 'f32':
			return `const ${key}: f32 = ${toF32Literal(value.value)};`;
		case 'i32':
			return `const ${key}: i32 = ${value.value};`;
		case 'u32':
			return `const ${key}: u32 = ${value.value}u;`;
		case 'vec2f':
		case 'vec3f':
		case 'vec4f':
			return toVectorDefineLine(key, value.type, value.value);
		default:
			throw new Error(`Invalid define value for "${key}". Unsupported define type.`);
	}
}

function expandChunk(
	source: string,
	kind: 'fragment' | 'include',
	includeName: string | undefined,
	includes: Record<string, string>,
	stack: string[],
	expandedIncludes: Set<string>
): { lines: string[]; mapEntries: MaterialSourceLocation[] } {
	const sourceLines = source.split('\n');
	const lines: string[] = [];
	const mapEntries: MaterialSourceLocation[] = [];

	for (let index = 0; index < sourceLines.length; index += 1) {
		const sourceLine = sourceLines[index];
		if (sourceLine === undefined) {
			continue;
		}

		const includeMatch = sourceLine.match(INCLUDE_DIRECTIVE_PATTERN);
		if (!includeMatch) {
			lines.push(sourceLine);
			mapEntries.push({
				kind,
				line: index + 1,
				...(kind === 'include' && includeName ? { include: includeName } : {})
			});
			continue;
		}

		const includeKey = includeMatch[1];
		if (!includeKey) {
			throw new Error('Invalid include directive in fragment shader.');
		}

		assertUniformName(includeKey);
		const includeSource = includes[includeKey];
		if (!includeSource) {
			throw new Error(`Unknown include "${includeKey}" referenced in fragment shader.`);
		}

		if (stack.includes(includeKey)) {
			throw new Error(
				`Circular include detected for "${includeKey}". Include stack: ${[...stack, includeKey].join(' -> ')}.`
			);
		}

		if (expandedIncludes.has(includeKey)) {
			continue;
		}
		expandedIncludes.add(includeKey);

		const nested = expandChunk(
			includeSource,
			'include',
			includeKey,
			includes,
			[...stack, includeKey],
			expandedIncludes
		);
		lines.push(...nested.lines);
		mapEntries.push(...nested.mapEntries);
	}

	return { lines, mapEntries };
}

/**
 * Preprocesses material fragment with deterministic define/include expansion and line mapping.
 */
export function preprocessMaterialFragment<
	TDefineKey extends string,
	TIncludeKey extends string
>(input: {
	fragment: string;
	defines?: MaterialDefines<TDefineKey>;
	includes?: MaterialIncludes<TIncludeKey>;
}): PreprocessedMaterialFragment {
	const normalizedDefines = normalizeDefines(input.defines);
	const normalizedIncludes = normalizeIncludes(input.includes);

	const fragmentExpanded = expandChunk(
		input.fragment,
		'fragment',
		undefined,
		normalizedIncludes,
		[],
		new Set()
	);
	const defineEntries = (
		Object.entries(normalizedDefines) as Array<[TDefineKey, MaterialDefineValue]>
	).sort(([a], [b]) => a.localeCompare(b));
	const lines: string[] = [];
	const defineLines: string[] = [];
	const mapEntries: Array<MaterialSourceLocation | null> = [];

	for (let index = 0; index < defineEntries.length; index += 1) {
		const entry = defineEntries[index];
		if (!entry) {
			continue;
		}

		const [name, value] = entry;
		const defineLine = toDefineLine(name, value);
		lines.push(defineLine);
		defineLines.push(defineLine);
		mapEntries.push({ kind: 'define', line: index + 1, define: name });
	}

	if (defineEntries.length > 0) {
		lines.push('');
		mapEntries.push(null);
	}

	lines.push(...fragmentExpanded.lines);
	mapEntries.push(...fragmentExpanded.mapEntries);

	const lineMap: MaterialLineMap = [null, ...mapEntries];
	return {
		fragment: lines.join('\n'),
		lineMap,
		defineBlockSource: defineLines.join('\n')
	};
}
