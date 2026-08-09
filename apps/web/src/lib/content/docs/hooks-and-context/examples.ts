export const basicUsageSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();
</script>`;

export const basicUsageReact = `\
import { useMotionGPU } from '@motion-core/motion-gpu/react';

function Component() {
  const gpu = useMotionGPU();
}`;

export const basicUsageVue = `\
<script setup lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/vue';

  const gpu = useMotionGPU();
</script>`;

export const readSizeSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';
  const gpu = useMotionGPU();
</script>

<p>Canvas: {$gpu.size.width}×{$gpu.size.height} @ {$gpu.dpr}x</p>`;

export const readSizeReact = `\
import { useMotionGPU } from '@motion-core/motion-gpu/react';
import { useSyncExternalStore } from 'react';

function Component() {
  const gpu = useMotionGPU();
  const size = useSyncExternalStore(gpu.size.subscribe, () => gpu.size.current);
  const dpr = useSyncExternalStore(gpu.dpr.subscribe, () => gpu.dpr.current);

  return <p>Canvas: {size.width}×{size.height} @ {dpr}x</p>;
}`;

export const readSizeVue = `\
<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  import { useMotionGPU } from '@motion-core/motion-gpu/vue';

  const gpu = useMotionGPU();
  const size = ref(gpu.size.current);
  const dpr = ref(gpu.dpr.current);

  let unsubs: (() => void)[] = [];
  onMounted(() => {
    unsubs.push(gpu.size.subscribe((v) => (size.value = v)));
    unsubs.push(gpu.dpr.subscribe((v) => (dpr.value = v)));
  });
  onBeforeUnmount(() => unsubs.forEach((u) => u()));
</script>

<template>
  <p>Canvas: {{ size.width }}×{{ size.height }} @ {{ dpr }}x</p>
</template>`;

export const togglePauseSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';
  const gpu = useMotionGPU();

  function togglePause() {
    gpu.autoRender.set(!gpu.autoRender.current);
  }
</script>

<button onclick={togglePause}>
  {$gpu.autoRender ? 'Pause' : 'Resume'}
</button>`;

export const togglePauseReact = `\
import { useMotionGPU } from '@motion-core/motion-gpu/react';
import { useSyncExternalStore } from 'react';

function Component() {
  const gpu = useMotionGPU();
  const autoRender = useSyncExternalStore(
    gpu.autoRender.subscribe,
    () => gpu.autoRender.current
  );

  function togglePause() {
    gpu.autoRender.set(!gpu.autoRender.current);
  }

  return (
    <button onClick={togglePause}>
      {autoRender ? 'Pause' : 'Resume'}
    </button>
  );
}`;

export const togglePauseVue = `\
<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  import { useMotionGPU } from '@motion-core/motion-gpu/vue';

  const gpu = useMotionGPU();
  const autoRender = ref(gpu.autoRender.current);

  let unsub: (() => void) | undefined;
  onMounted(() => {
    unsub = gpu.autoRender.subscribe((v) => (autoRender.value = v));
  });
  onBeforeUnmount(() => unsub?.());

  function togglePause() {
    gpu.autoRender.set(!gpu.autoRender.current);
  }
</script>

<template>
  <button @click="togglePause">
    {{ autoRender ? 'Pause' : 'Resume' }}
  </button>
</template>`;

export const onDemandExternalSvelte = `\
<script lang="ts">
  import { useMotionGPU, useFrame, usePointer } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();
  const pointer = usePointer({ requestFrame: 'auto' });

  $effect(() => {
    gpu.renderMode.set('on-demand');
  });

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', pointer.state.current.uv);
  }, { autoInvalidate: false });
</script>`;

export const onDemandExternalReact = `\
import { useMotionGPU, useFrame, usePointer } from '@motion-core/motion-gpu/react';
import { useEffect } from 'react';

function Component() {
  const gpu = useMotionGPU();
  const pointer = usePointer({ requestFrame: 'auto' });

  useEffect(() => {
    gpu.renderMode.set('on-demand');
  }, [gpu]);

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', pointer.state.current.uv);
  }, { autoInvalidate: false });

  return null;
}`;

export const onDemandExternalVue = `\
<script setup lang="ts">
  import { onMounted } from 'vue';
  import { useMotionGPU, useFrame, usePointer } from '@motion-core/motion-gpu/vue';

  const gpu = useMotionGPU();
  const pointer = usePointer({ requestFrame: 'auto' });

  onMounted(() => {
    gpu.renderMode.set('on-demand');
  });

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', pointer.state.current.uv);
  }, { autoInvalidate: false });
</script>`;
