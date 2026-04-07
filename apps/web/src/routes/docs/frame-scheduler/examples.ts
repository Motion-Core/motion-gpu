export const basicUsageSvelte = `\
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });
</script>`;

export const basicUsageReact = `\
import { useFrame } from '@motion-core/motion-gpu/react';

function Runtime() {
  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });
  return null;
}`;

export const completeRuntimeSvelte = `\
<script lang="ts">
  import { useFrame, usePointer } from '@motion-core/motion-gpu/svelte';

  const pointer = usePointer();

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', pointer.state.current.uv);
  });
</script>`;

export const completeRuntimeReact = `\
import { useFrame, usePointer } from '@motion-core/motion-gpu/react';

function Runtime() {
  const pointer = usePointer();

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', pointer.state.current.uv);
  });

  return null;
}`;
