# Render Targets and Passes

Fragkit supports optional post-processing chains via `renderTargets` and `passes` props.

## Render targets

`renderTargets` defines named GPU textures available to passes.

```ts
renderTargets: {
  uHalf: { scale: 0.5 },
  uBloom: { width: 320, height: 200, format: 'rgba16float' }
}
```

Resolution rules:

- keys sorted deterministically
- key names validated as identifiers
- explicit width/height override scaled canvas dimensions
- unspecified dimensions use `canvasDimension * scale`
- invalid scale/dimensions throw

Renderer tracks a signature (`key:format:WxH|...`) and recreates only changed targets.

## Pass contract

A pass is:

```ts
type RenderPass = (ctx: RenderPassContext) => GPUTextureView | void
```

Context fields:

- `device`, `commandEncoder`
- `sourceView` (current upstream texture)
- `canvasView` (swapchain texture view)
- `targets` (named resolved targets)
- `time`, `delta`, `width`, `height`

## Pass chaining

Pipeline behavior when passes exist:

1. Scene renders into offscreen source texture.
2. Passes run in order.
3. If pass returns `GPUTextureView`, it becomes next `sourceView`.
4. After all passes, if final source view is not `canvasView`, Fragkit performs fullscreen blit to canvas.

If a pass renders directly to `canvasView`, it can return `canvasView` to avoid extra blit.

## Without passes

Scene renders directly to current canvas texture; no offscreen scene target or blit step is used.
