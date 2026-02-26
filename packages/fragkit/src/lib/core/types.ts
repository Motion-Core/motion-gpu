export type UniformType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f';

export interface TypedUniform<TType extends UniformType = UniformType, TValue = unknown> {
	type: TType;
	value: TValue;
}

export type UniformMat4Value = number[] | Float32Array;
export type UniformValue =
	| number
	| [number, number]
	| [number, number, number]
	| [number, number, number, number]
	| TypedUniform<'f32', number>
	| TypedUniform<'vec2f', [number, number]>
	| TypedUniform<'vec3f', [number, number, number]>
	| TypedUniform<'vec4f', [number, number, number, number]>
	| TypedUniform<'mat4x4f', UniformMat4Value>;

export type UniformMap = Record<string, UniformValue>;

export interface UniformLayoutEntry {
	name: string;
	type: UniformType;
	offset: number;
	size: number;
}

export interface UniformLayout {
	entries: UniformLayoutEntry[];
	byName: Record<string, UniformLayoutEntry>;
	byteLength: number;
}
export type TextureSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export interface TextureData {
	source: TextureSource;
	width?: number;
	height?: number;
}

export type TextureValue = TextureData | TextureSource | null;

export interface TextureDefinition {
	source?: TextureValue;
	colorSpace?: 'srgb' | 'linear';
	flipY?: boolean;
	generateMipmaps?: boolean;
	premultipliedAlpha?: boolean;
	anisotropy?: number;
	filter?: GPUFilterMode;
	addressModeU?: GPUAddressMode;
	addressModeV?: GPUAddressMode;
}

export type TextureDefinitionMap = Record<string, TextureDefinition>;
export type TextureMap = Record<string, TextureValue>;
export type OutputColorSpace = 'srgb' | 'linear';

export type RenderMode = 'always' | 'on-demand' | 'manual';

export interface FrameState {
	time: number;
	delta: number;
	setUniform: (name: string, value: UniformValue) => void;
	setTexture: (name: string, value: TextureValue) => void;
	invalidate: () => void;
	advance: () => void;
	renderMode: RenderMode;
	autoRender: boolean;
	canvas: HTMLCanvasElement;
}

export interface RendererOptions {
	canvas: HTMLCanvasElement;
	fragmentWgsl: string;
	uniformLayout: UniformLayout;
	textureKeys: string[];
	textureDefinitions: TextureDefinitionMap;
	outputColorSpace: OutputColorSpace;
	clearColor: [number, number, number, number];
	getDpr: () => number;
}

export interface Renderer {
	render: (input: {
		time: number;
		delta: number;
		uniforms: UniformMap;
		textures: TextureMap;
	}) => void;
	destroy: () => void;
}
