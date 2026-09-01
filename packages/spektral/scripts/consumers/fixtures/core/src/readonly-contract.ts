import type {
	StorageBufferDefinition,
	TextureData,
	TextureDefinition,
	TypedUniform
} from 'spektral';

type PublicReadonlyVec2 = TypedUniform<'vec2f'>['value'];

const mutableTupleInput: [number, number] = [0.25, 0.75];
const mutableTypedUniformInput: { type: 'vec2f'; value: [number, number] } = {
	type: 'vec2f',
	value: mutableTupleInput
};
const mutableTextureDataInput: {
	source: HTMLCanvasElement;
	width: number;
	flipY: boolean;
} = {
	source: {} as HTMLCanvasElement,
	width: 2,
	flipY: false
};
const mutableTextureDefinitionInput: {
	source: typeof mutableTextureDataInput;
	filter: GPUFilterMode;
	generateMipmaps: boolean;
} = {
	source: mutableTextureDataInput,
	filter: 'linear',
	generateMipmaps: false
};
const mutableInitialData = new Float32Array([0, 1, 2, 3]);
const mutableStorageBufferInput: {
	size: number;
	type: 'array<f32>';
	initialData: Float32Array;
} = {
	size: mutableInitialData.byteLength,
	type: 'array<f32>',
	initialData: mutableInitialData
};

export const readonlyInputContract = {
	storageBuffer: mutableStorageBufferInput satisfies StorageBufferDefinition,
	textureData: mutableTextureDataInput satisfies TextureData,
	textureDefinition: mutableTextureDefinitionInput satisfies TextureDefinition,
	tuple: mutableTupleInput satisfies PublicReadonlyVec2,
	typedUniform: mutableTypedUniformInput satisfies TypedUniform<'vec2f'>
};

function rejectMutations(
	typedUniform: TypedUniform<'vec2f'>,
	tuple: PublicReadonlyVec2,
	textureData: TextureData,
	textureDefinition: TextureDefinition,
	storageBuffer: StorageBufferDefinition
): void {
	// @ts-expect-error public typed uniform fields are readonly
	typedUniform.type = 'vec2f';
	// @ts-expect-error public typed uniform tuple elements are readonly
	typedUniform.value[0] = 1;
	// @ts-expect-error public uniform tuple elements are readonly
	tuple[0] = 1;
	// @ts-expect-error public texture data fields are readonly
	textureData.width = 4;
	// @ts-expect-error public texture definition fields are readonly
	textureDefinition.filter = 'nearest';
	// @ts-expect-error public storage-buffer initial data is readonly
	storageBuffer.initialData = new Float32Array([4]);
	if (storageBuffer.initialData) {
		// @ts-expect-error public storage-buffer initial data elements are readonly
		storageBuffer.initialData[0] = 4;
		// @ts-expect-error public storage-buffer initial data mutators are hidden
		storageBuffer.initialData.set([4], 0);
	}
}

void rejectMutations;
