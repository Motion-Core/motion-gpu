# Types Reference

This section summarizes the most important type contracts exported by `fragkit`.

## Render mode

```ts
type RenderMode = 'always' | 'on-demand' | 'manual'
```

- `always`: render each frame
- `on-demand`: render only when invalidated
- `manual`: render only when advanced

## Uniform types

```ts
type UniformType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f'
```

```ts
type UniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]
  | TypedUniform<'f32', number>
  | TypedUniform<'vec2f', [number, number]>
  | TypedUniform<'vec3f', [number, number, number]>
  | TypedUniform<'vec4f', [number, number, number, number]>
  | TypedUniform<'mat4x4f', number[] | Float32Array>
```

```ts
type UniformMap = Record<string, UniformValue>
```

Matrix uniforms require explicit typed form to infer layout (`{ type: 'mat4x4f', value: ... }`).

## Texture types

```ts
type TextureSource =
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
```

```ts
interface TextureData {
  source: TextureSource
  width?: number
  height?: number
}

type TextureValue = TextureData | TextureSource | null
```

```ts
interface TextureDefinition {
  source?: TextureValue
  colorSpace?: 'srgb' | 'linear'
  flipY?: boolean
  generateMipmaps?: boolean
  premultipliedAlpha?: boolean
  anisotropy?: number
  filter?: GPUFilterMode
  addressModeU?: GPUAddressMode
  addressModeV?: GPUAddressMode
}
```

## Material types

```ts
type MaterialDefineValue = string | number | boolean
type MaterialDefines = Record<string, MaterialDefineValue>
```

```ts
interface FragMaterial {
  fragment: string
  uniforms?: UniformMap
  textures?: TextureDefinitionMap
  defines?: MaterialDefines
}
```

## Render pass and targets

```ts
interface RenderTargetDefinition {
  width?: number
  height?: number
  scale?: number
  format?: GPUTextureFormat
}
```

```ts
interface RenderPassContext {
  device: GPUDevice
  commandEncoder: GPUCommandEncoder
  sourceView: GPUTextureView
  canvasView: GPUTextureView
  targets: Readonly<Record<string, RenderTarget>>
  time: number
  delta: number
  width: number
  height: number
}

type RenderPass = (context: RenderPassContext) => GPUTextureView | void
```

## Frame state

`useFrame` callback receives:

```ts
interface FrameState {
  time: number
  delta: number
  setUniform: (name: string, value: UniformValue) => void
  setTexture: (name: string, value: TextureValue) => void
  invalidate: () => void
  advance: () => void
  renderMode: RenderMode
  autoRender: boolean
  canvas: HTMLCanvasElement
}
```

## Name validity rules

Uniform/texture/render-target keys are validated against identifier pattern:

- must start with `[A-Za-z_]`
- then only `[A-Za-z0-9_]`

Invalid names (for example `bad-key`) throw runtime errors.
