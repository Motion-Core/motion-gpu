/**
 * Source metadata for a material declaration callsite.
 */
export interface MaterialSourceMetadata {
	readonly component?: string;
	readonly file?: string;
	readonly line?: number;
	readonly column?: number;
	readonly functionName?: string;
}

/**
 * WGSL float-vector types accepted by compile-time define declarations.
 */
export type MaterialDefineVectorType = 'vec2f' | 'vec3f' | 'vec4f';

/**
 * Tuple value for a WGSL float-vector define declaration.
 */
export type MaterialDefineVectorValue<TType extends MaterialDefineVectorType> =
	TType extends 'vec2f'
		? readonly [number, number]
		: TType extends 'vec3f'
			? readonly [number, number, number]
			: readonly [number, number, number, number];

/**
 * Typed WGSL float-vector define declaration.
 */
export type TypedMaterialVectorDefineValue = {
	[TType in MaterialDefineVectorType]: {
		/**
		 * WGSL float-vector type.
		 */
		type: TType;
		/**
		 * Literal vector components for the selected WGSL type.
		 */
		value: MaterialDefineVectorValue<TType>;
	};
}[MaterialDefineVectorType];

/**
 * Typed compile-time define declaration.
 */
export type TypedMaterialDefineValue =
	| {
			/**
			 * WGSL scalar type.
			 */
			type: 'bool';
			/**
			 * Literal value for the selected WGSL type.
			 */
			value: boolean;
	  }
	| {
			/**
			 * WGSL scalar type.
			 */
			type: 'f32' | 'i32' | 'u32';
			/**
			 * Literal value for the selected WGSL type.
			 */
			value: number;
	  }
	| TypedMaterialVectorDefineValue;

/**
 * Allowed value types for WGSL `const` define injection.
 */
export type MaterialDefineValue = boolean | number | TypedMaterialDefineValue;

/**
 * Define map keyed by uniform-compatible identifier names.
 */
export type MaterialDefines<TKey extends string = string> = Record<TKey, MaterialDefineValue>;

/**
 * Include map keyed by include identifier used in `#include <name>` directives.
 */
export type MaterialIncludes<TKey extends string = string> = Record<TKey, string>;

/**
 * Source location metadata for one generated fragment line.
 */
export interface MaterialSourceLocation {
	/**
	 * Origin category for this generated line.
	 */
	readonly kind: 'fragment' | 'include' | 'define';
	/**
	 * 1-based line in the origin source.
	 */
	readonly line: number;
	/**
	 * Include chunk identifier when `kind === "include"`.
	 */
	readonly include?: string;
	/**
	 * Define identifier when `kind === "define"`.
	 */
	readonly define?: string;
}

/**
 * 1-based line map from generated fragment WGSL to user source locations.
 */
export type MaterialLineMap = ReadonlyArray<MaterialSourceLocation | null>;

/**
 * Preprocess output used by material resolution and diagnostics mapping.
 */
export interface PreprocessedMaterialFragment {
	/**
	 * Final fragment source after defines/include expansion.
	 */
	readonly fragment: string;
	/**
	 * 1-based generated-line source map.
	 */
	readonly lineMap: MaterialLineMap;
	/**
	 * Deterministic WGSL define block used to build the final fragment source.
	 */
	readonly defineBlockSource: string;
}
