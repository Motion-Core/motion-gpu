import { assertUniformName } from './uniforms';
import type {
	MaterialDefineValue,
	MaterialDefines,
	MaterialIncludes,
	TypedMaterialDefineValue
} from './material';

const INCLUDE_DIRECTIVE_PATTERN = /^\s*#include\s+<([A-Za-z_][A-Za-z0-9_]*)>\s*$/;

/**
 * Source location metadata for one generated fragment line.
 */
export interface MaterialSourceLocation {
	/**
	 * Origin category for this generated line.
	 */
	kind: 'fragment' | 'include' | 'define';
	/**
	 * 1-based line in the origin source.
	 */
	line: number;
	/**
	 * Include chunk identifier when `kind === "include"`.
	 */
	include?: string;
	/**
	 * Define identifier when `kind === "define"`.
	 */
	define?: string;
}

/**
 * 1-based line map from generated fragment WGSL to user source locations.
 */
export type MaterialLineMap = Array<MaterialSourceLocation | null>;

/**
 * Preprocess output used by material resolution and diagnostics mapping.
 */
export interface PreprocessedMaterialFragment {
	/**
	 * Final fragment source after defines/include expansion.
	 */
	fragment: string;
	/**
	 * 1-based generated-line source map.
	 */
	lineMap: MaterialLineMap;
}

function normalizeTypedDefine(
	name: string,
	define: TypedMaterialDefineValue
): {
	type: TypedMaterialDefineValue['type'];
	value: boolean | number;
} {
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

/**
 * Validates and normalizes define entries.
 */
export function normalizeDefines(defines: MaterialDefines | undefined): MaterialDefines {
	const resolved: MaterialDefines = {};

	for (const [name, value] of Object.entries(defines ?? {})) {
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
		resolved[name] = Object.freeze({
			type: normalized.type,
			value: normalized.value
		});
	}

	return resolved;
}

/**
 * Validates include map identifiers and source chunks.
 */
export function normalizeIncludes(includes: MaterialIncludes | undefined): MaterialIncludes {
	const resolved: MaterialIncludes = {};

	for (const [name, source] of Object.entries(includes ?? {})) {
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
		const valueLiteral = Number.isInteger(value) ? `${value}.0` : `${value}`;
		return `const ${key}: f32 = ${valueLiteral};`;
	}

	if (value.type === 'bool') {
		return `const ${key}: bool = ${value.value ? 'true' : 'false'};`;
	}

	if (value.type === 'f32') {
		const numberValue = value.value as number;
		const valueLiteral = Number.isInteger(numberValue) ? `${numberValue}.0` : `${numberValue}`;
		return `const ${key}: f32 = ${valueLiteral};`;
	}

	if (value.type === 'i32') {
		return `const ${key}: i32 = ${value.value};`;
	}

	return `const ${key}: u32 = ${value.value}u;`;
}

function expandChunk(
	source: string,
	kind: 'fragment' | 'include',
	includeName: string | undefined,
	includes: MaterialIncludes,
	stack: string[]
): { lines: string[]; mapEntries: MaterialSourceLocation[] } {
	const sourceLines = source.split('\n');
	const lines: string[] = [];
	const mapEntries: MaterialSourceLocation[] = [];

	for (let index = 0; index < sourceLines.length; index += 1) {
		const sourceLine = sourceLines[index];
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

		const nested = expandChunk(includeSource, 'include', includeKey, includes, [
			...stack,
			includeKey
		]);
		lines.push(...nested.lines);
		mapEntries.push(...nested.mapEntries);
	}

	return { lines, mapEntries };
}

/**
 * Preprocesses material fragment with deterministic define/include expansion and line mapping.
 */
export function preprocessMaterialFragment(input: {
	fragment: string;
	defines?: MaterialDefines;
	includes?: MaterialIncludes;
}): PreprocessedMaterialFragment {
	const normalizedDefines = normalizeDefines(input.defines);
	const normalizedIncludes = normalizeIncludes(input.includes);

	const fragmentExpanded = expandChunk(
		input.fragment,
		'fragment',
		undefined,
		normalizedIncludes,
		[]
	);
	const defineEntries = Object.entries(normalizedDefines).sort(([a], [b]) => a.localeCompare(b));
	const lines: string[] = [];
	const mapEntries: Array<MaterialSourceLocation | null> = [];

	for (const [name, value] of defineEntries) {
		lines.push(toDefineLine(name, value));
		mapEntries.push({ kind: 'define', line: 1, define: name });
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
		lineMap
	};
}
