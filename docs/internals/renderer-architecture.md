# Renderer Architecture (Internal)

This section describes `src/lib/core/renderer.ts`, which is not directly exported but is central to runtime behavior.

## Initialization pipeline

1. Validate `navigator.gpu`
2. Request adapter and device
3. Acquire `webgpu` canvas context
4. Build shader source via `buildShaderSource`
5. Compile/validate shader modules (`getCompilationInfo`)
6. Create scene pipeline and blit pipeline
7. Create frame/uniform buffers
8. Build texture samplers/bindings and fallback textures

## Binding layout

Binding indices are deterministic:

- `0`: frame uniform buffer (`time`, `delta`, `resolution`)
- `1`: packed material uniform buffer
- from `2`: per texture pair:
  - sampler at `2 + i*2`
  - texture at `3 + i*2`

## Texture runtime model

Each texture key has mutable runtime binding state:

- current source identity
- size and mip metadata
- GPU texture/view
- fallback view

Bind group is recreated only if any texture binding changes.

## Render path

Per render call:

1. Resize canvas from CSS size * DPR
2. Configure GPU context
3. Upload frame buffer
4. Pack/upload uniforms
5. Sync runtime texture bindings
6. Create command encoder
7. Draw scene pass
8. Run optional post passes
9. Blit final result if needed
10. Submit queue

## Render targets

Named render targets are reconciled against definition signature.
Only changed/removed targets are recreated/destroyed.

## Resource destruction

`destroy()` releases:

- frame/uniform buffers
- scene offscreen target
- all runtime render targets
- all texture GPU resources (including fallbacks)

This is called by `FragCanvas` teardown and when replacing renderer instance.
