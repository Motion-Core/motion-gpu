# Getting Started

## Requirements

- Svelte 5 (`peerDependencies: svelte ^5.0.0`)
- Browser with WebGPU support
- Secure context (HTTPS or localhost) for WebGPU

If WebGPU is unavailable, `FragCanvas` shows an in-canvas diagnostic overlay.

## Install

```bash
npm install fragkit svelte
```

In this monorepo, the web app consumes it via workspace dependency:

```json
{
  "dependencies": {
    "fragkit": "workspace:*"
  }
}
```

## Minimal Example

```svelte
<script lang="ts">
  import { FragCanvas, createMaterial } from 'fragkit';

  const material = createMaterial({
    fragment: `
fn frag(uv: vec2f) -> vec4f {
  return vec4f(uv.x, uv.y, 0.25, 1.0);
}
`
  });
</script>

<div style="width: 100%; height: 420px;">
  <FragCanvas {material} />
</div>
```

## With Material Object

```ts
import { createMaterial } from 'fragkit';

const material = createMaterial({
  fragment: `
fn frag(uv: vec2f) -> vec4f {
  return vec4f(uv, 0.0, 1.0);
}
`,
  uniforms: {
    uTimeScale: 1.0,
    uTint: [1, 0.8, 0.7, 1]
  },
  textures: {
    uMainTex: {}
  },
  defines: {
    USE_GRAIN: true,
    GRAIN_AMOUNT: 0.2
  }
});
```

```svelte
<FragCanvas {material} />
```

## Runtime Hooks

Use hooks only inside `<FragCanvas>` subtree:

- `useFragkit()` for canvas/runtime control
- `useFrame()` for per-frame logic and ordering
- `useTexture()` for async URL texture loading

See [Hooks Reference](./reference/hooks.md).

## Render Modes

- `always`: render every frame
- `on-demand`: render only when invalidated
- `manual`: render only when advanced

You can control this via `FragCanvas` props or the context returned by `useFragkit()`.

## Next

- [FragCanvas API](./reference/frag-canvas.md)
- [Materials and Shader Contract](./concepts/materials-and-shaders.md)
- [Render Loop and Scheduling](./concepts/render-loop-and-scheduling.md)
