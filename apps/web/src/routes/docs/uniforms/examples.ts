export const runtimeUpdatesSvelte = `\
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', [mouseX, mouseY]);
  });
</script>`;

export const runtimeUpdatesReact = `\
import { useFrame } from '@motion-core/motion-gpu/react';

function Runtime() {
  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', [mouseX, mouseY]);
  });

  return null;
}`;

export const runtimeUpdatesVue = `\
<script setup lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/vue';

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', [mouseX, mouseY]);
  });
</script>`;
