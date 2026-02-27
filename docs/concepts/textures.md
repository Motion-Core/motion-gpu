# Textures

## Texture declarations

Textures are declared by key in `TextureDefinitionMap`.

```ts
textures: {
  uMain: {
    source: null,
    colorSpace: 'srgb',
    flipY: true,
    generateMipmaps: false,
    premultipliedAlpha: false,
    anisotropy: 1,
    filter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge'
  }
}
```

## Defaults

When fields are omitted:

- `source`: `null`
- `colorSpace`: `'srgb'`
- GPU format: `rgba8unorm-srgb` (`linear` uses `rgba8unorm`)
- `flipY`: `true`
- `generateMipmaps`: `false`
- `premultipliedAlpha`: `false`
- `anisotropy`: clamped to `[1, 16]`
- `filter`: `'linear'`
- address modes: `'clamp-to-edge'`

## Runtime binding behavior

For each texture key, renderer keeps:

- sampler
- fallback 1x1 white texture
- optional uploaded GPU texture

If runtime texture value is `null`, fallback texture is used.

## Upload semantics

- source dimensions are resolved from explicit `TextureData.width/height` or source natural/video dimensions
- invalid/zero dimensions throw
- upload uses `copyExternalImageToTexture`
- video sources are re-uploaded every frame even when object identity is unchanged
- optional mipmaps are generated on CPU via 2D canvas downsampling

## `useTexture` helper

`useTexture` loads URLs through `fetch` + `createImageBitmap` and returns reactive state.

Important details:

- blob fetches are cached per `requestInit.cache + url`
- failed fetch removes cache entry so retry can succeed
- `colorSpace: 'linear'` uses `createImageBitmap(..., { colorSpaceConversion: 'none' })`
- loaded `ImageBitmap`s are disposed on replacement and unmount

## Runtime updates in `useFrame`

Use `setTexture(name, value)` to bind per-frame textures.
Name must be declared in material texture map or it throws.
