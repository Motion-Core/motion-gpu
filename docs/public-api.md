# Public API Overview

The package root export (`fragkit`) currently contains:

## Runtime exports

- `FragCanvas` (Svelte component)
- `createMaterial(input: FragMaterial): FragMaterial`
- `useFragkit(): FragkitContext`
- `useFrame(...)`
- `useTexture(...)`

## Type exports

From `core/types`:

- `FrameState`
- `OutputColorSpace`
- `RenderPass`
- `RenderPassContext`
- `RenderMode`
- `RenderTarget`
- `RenderTargetDefinition`
- `RenderTargetDefinitionMap`
- `TextureData`
- `TextureDefinition`
- `TextureDefinitionMap`
- `TextureMap`
- `TextureSource`
- `TextureValue`
- `TypedUniform`
- `UniformLayout`
- `UniformLayoutEntry`
- `UniformMat4Value`
- `UniformMap`
- `UniformType`
- `UniformValue`

From `core/texture-loader`:

- `LoadedTexture`
- `TextureLoadOptions`

From `core/material`:

- `FragMaterial`
- `MaterialDefineValue`
- `MaterialDefines`

From context/hooks:

- `FragkitContext`
- `FrameKey`
- `FrameStage`
- `FrameTask`
- `UseFrameOptions`
- `UseFrameResult`
- `TextureUrlInput`
- `UseTextureResult`

## API Layers

- High-level rendering: `FragCanvas`
- Per-frame orchestration: `useFrame`, `useFragkit`
- Asset loading: `useTexture`
- Material authoring: `createMaterial`
- Type-safe contracts: exported TS types

## Internal (not root-exported)

The following are implementation details and can change without public API guarantees:

- `createRenderer` (`core/renderer.ts`)
- shader assembly helpers
- render target resolver helpers
- internal `Portal` component
