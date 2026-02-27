import type { TextureDefinitionMap, UniformMap } from './types';
import { assertUniformName, resolveUniformLayout } from './uniforms';

export type MaterialDefineValue = string | number | boolean;
export type MaterialDefines = Record<string, MaterialDefineValue>;

export interface FragMaterial {
	fragment: string;
	uniforms?: UniformMap;
	textures?: TextureDefinitionMap;
	defines?: MaterialDefines;
}

export interface ResolvedMaterial {
	fragmentWgsl: string;
	uniforms: UniformMap;
	textures: TextureDefinitionMap;
	uniformLayout: ReturnType<typeof resolveUniformLayout>;
	textureKeys: string[];
	signature: string;
}

function toDefineLine(key: string, value: MaterialDefineValue): string {
	if (typeof value === 'boolean') {
		return `const ${key}: bool = ${value ? 'true' : 'false'};`;
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new Error(`Invalid define value for "${key}". Define numbers must be finite.`);
		}

		const valueLiteral = Number.isInteger(value) ? `${value}.0` : `${value}`;
		return `const ${key}: f32 = ${valueLiteral};`;
	}

	return `const ${key} = ${value};`;
}

export function buildDefinesBlock(defines: MaterialDefines | undefined): string {
	if (!defines || Object.keys(defines).length === 0) {
		return '';
	}

	return Object.entries(defines)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => {
			assertUniformName(key);
			return toDefineLine(key, value);
		})
		.join('\n');
}

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

export function createMaterial(input: FragMaterial): FragMaterial {
	return {
		fragment: input.fragment,
		uniforms: { ...(input.uniforms ?? {}) },
		textures: { ...(input.textures ?? {}) },
		defines: { ...(input.defines ?? {}) }
	};
}

export function resolveMaterial(material: FragMaterial): ResolvedMaterial {
	const base = material;
	const uniforms = { ...(base.uniforms ?? {}) };
	const textures = { ...(base.textures ?? {}) };
	const uniformLayout = resolveUniformLayout(uniforms);
	const textureKeys = Object.keys(textures).sort();
	const fragmentWgsl = applyMaterialDefines(base.fragment, base.defines);

	const signature = JSON.stringify({
		fragmentWgsl,
		uniforms: uniformLayout.entries.map((entry) => `${entry.name}:${entry.type}`),
		textureKeys
	});

	return {
		fragmentWgsl,
		uniforms,
		textures,
		uniformLayout,
		textureKeys,
		signature
	};
}
