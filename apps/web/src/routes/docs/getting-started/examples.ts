export const step1Svelte = `\
<!-- App.svelte -->
<script lang="ts">
  import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';

  const material = defineMaterial({
    fragment: \`
fn frag(uv: vec2f) -> vec4f {
  return vec4f(uv.x, uv.y, 0.2, 1.0);
}
\`
  });
</script>

<div style="width: 100vw; height: 100vh;">
  <FragCanvas {material} />
</div>`;

export const step1React = `\
// App.tsx
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
  fragment: \`
fn frag(uv: vec2f) -> vec4f {
  return vec4f(uv.x, uv.y, 0.2, 1.0);
}
\`
});

export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <FragCanvas material={material} />
    </div>
  );
}`;

export const step2AppSvelte = `\
<!-- App.svelte -->
<script lang="ts">
  import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';
  import Runtime from './Runtime.svelte';

  const material = defineMaterial({
    fragment: \`
fn frag(uv: vec2f) -> vec4f {
  let wave = 0.5 + 0.5 * sin(motiongpuUniforms.uTime + uv.x * 8.0);
  return vec4f(vec3f(wave), 1.0);
}
\`,
    uniforms: {
      uTime: { type: 'f32', value: 0 }
    }
  });
</script>

<FragCanvas {material}>
  <Runtime />
</FragCanvas>`;

export const step2AppReact = `\
// App.tsx
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';
import { Runtime } from './Runtime';

const material = defineMaterial({
  fragment: \`
fn frag(uv: vec2f) -> vec4f {
  let wave = 0.5 + 0.5 * sin(motiongpuUniforms.uTime + uv.x * 8.0);
  return vec4f(vec3f(wave), 1.0);
}
\`,
  uniforms: {
    uTime: { type: 'f32', value: 0 }
  }
});

export function App() {
  return (
    <FragCanvas material={material}>
      <Runtime />
    </FragCanvas>
  );
}`;

export const step2RuntimeSvelte = `\
<!-- Runtime.svelte -->
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });
</script>`;

export const step2RuntimeReact = `\
// Runtime.tsx
import { useFrame } from '@motion-core/motion-gpu/react';

export function Runtime() {
  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });
  return null;
}`;
