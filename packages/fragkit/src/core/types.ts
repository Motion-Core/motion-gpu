export type UniformValue =
	| number
	| [number, number]
	| [number, number, number]
	| [number, number, number, number];

export type UniformMap = Record<string, UniformValue>;

export interface FrameState {
	time: number;
	delta: number;
	setUniform: (name: string, value: UniformValue) => void;
	canvas: HTMLCanvasElement;
}

export interface RendererOptions {
	canvas: HTMLCanvasElement;
	fragmentWgsl: string;
	uniformKeys: string[];
	clearColor: [number, number, number, number];
}

export interface Renderer {
	render: (input: { time: number; delta: number; uniforms: UniformMap }) => void;
	destroy: () => void;
}
