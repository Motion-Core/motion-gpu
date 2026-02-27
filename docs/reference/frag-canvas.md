# FragCanvas Component

`FragCanvas` is the main rendering component. It owns:

- WebGPU renderer lifecycle
- frame scheduling and render policy
- context providers for hooks
- runtime error overlay

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `material` | `FragMaterial` | required | Main material input (fragment + uniforms + textures + defines). |
| `renderTargets` | `RenderTargetDefinitionMap` | `{}` | Optional named offscreen targets for passes. |
| `passes` | `RenderPass[]` | `[]` | Optional post-processing pass chain. |
| `clearColor` | `[number, number, number, number]` | `[0, 0, 0, 1]` | Used in scene clear and final blit clear. |
| `outputColorSpace` | `'srgb' \| 'linear'` | `'srgb'` | May inject linear->sRGB conversion in shader wrapper. |
| `renderMode` | `'always' \| 'on-demand' \| 'manual'` | `'always'` | Frame output policy. |
| `autoRender` | `boolean` | `true` | Global render gate. If `false`, no rendering occurs. |
| `dpr` | `number` | `window.devicePixelRatio` (or `1` in SSR) | Used every frame for canvas backing resolution. |
| `class` | `string` | `''` | Applied to `<canvas>` element. |
| `style` | `string` | `''` | Applied to `<canvas>` element. |
| `children` | `Snippet` | `undefined` | Rendered inside wrapper after canvas. |

## Material Resolution Rules

`resolveMaterial`:

- sorts uniform keys and texture keys
- computes uniform layout
- applies define prelude to fragment source
- creates a renderer signature used to detect when pipeline rebuild is needed

## Renderer Rebuild Triggers

Renderer instance is recreated when this signature changes:

- resolved material signature (fragment + uniform types + texture keys)
- `outputColorSpace`
- `clearColor`

Notably, per-frame uniform values and texture object instances do not force pipeline rebuild.

## Context Provided to Descendants

`FragCanvas` provides:

- Fragkit context (`useFragkit`)
- frame registry context (`useFrame`)

Both hooks throw if used outside `FragCanvas`.

## Error Overlay

When initialization or rendering fails, component renders an overlay in a portal with:

- phase (`initialization` or `render`)
- classified title
- message and hint
- optional details and stack traces

This is intentionally user-readable and includes common WebGPU failure hints.

## SSR and Mounting

WebGPU initialization occurs in `onMount`, so server rendering does not execute GPU setup.
If canvas binding fails on mount, component reports initialization error.

## Example

```svelte
<script lang="ts">
  import { FragCanvas, createMaterial } from 'fragkit';

  const material = createMaterial({
    fragment: `
fn frag(uv: vec2f) -> vec4f {
  return vec4f(uv.x, uv.y, 0.4, 1.0);
}
`,
    uniforms: {
      uSpeed: 1.0
    }
  });
</script>

<div style="height: 420px;">
  <FragCanvas
    {material}
    renderMode="on-demand"
    autoRender={true}
    clearColor={[0, 0, 0, 1]}
    outputColorSpace="srgb"
  />
</div>
```
