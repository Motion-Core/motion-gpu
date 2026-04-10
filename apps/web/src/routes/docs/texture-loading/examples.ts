export const basicUsageSvelte = `\
<script lang="ts">
  import { useFrame, useTexture } from '@motion-core/motion-gpu/svelte';

  const loaded = useTexture(['/assets/albedo.png']);

  useFrame((state) => {
    const tex = loaded.textures.current?.[0];
    state.setTexture('uAlbedo', tex ? { source: tex.source } : null);
  });
</script>`;

export const basicUsageReact = `\
import { useFrame, useTexture } from '@motion-core/motion-gpu/react';

function Runtime() {
  const loaded = useTexture(['/assets/albedo.png']);

  useFrame((state) => {
    const tex = loaded.textures.current?.[0];
    state.setTexture('uAlbedo', tex ? { source: tex.source } : null);
  });

  return null;
}`;

export const basicUsageVue = `\
<script setup lang="ts">
  import { useFrame, useTexture } from '@motion-core/motion-gpu/vue';

  const loaded = useTexture(['/assets/albedo.png']);

  useFrame((state) => {
    const tex = loaded.textures.current?.[0];
    state.setTexture('uAlbedo', tex ? { source: tex.source } : null);
  });
</script>`;

export const reactiveUISvelte = `\
<script lang="ts">
  const { textures, loading, error, errorReport } = useTexture(['/assets/albedo.png']);
</script>

{#if $loading}
  <p>Loading textures...</p>
{:else if $error}
  <p>Error: {$error.message}</p>
  {#if $errorReport}
    <p>Code: {$errorReport.code}</p>
    <p>Hint: {$errorReport.hint}</p>
  {/if}
{:else}
  <p>Loaded {$textures?.length ?? 0} textures</p>
{/if}`;

export const reactiveUIReact = `\
import { useTexture } from '@motion-core/motion-gpu/react';
import { useSyncExternalStore } from 'react';

function StatusUI() {
  const { textures, loading, error, errorReport } = useTexture(['/assets/albedo.png']);

  const isLoading = useSyncExternalStore(loading.subscribe, () => loading.current);
  const err = useSyncExternalStore(error.subscribe, () => error.current);
  const report = useSyncExternalStore(errorReport.subscribe, () => errorReport.current);
  const texs = useSyncExternalStore(textures.subscribe, () => textures.current);

  if (isLoading) return <p>Loading textures...</p>;
  if (err) return (
    <>
      <p>Error: {err.message}</p>
      {report && (
        <>
          <p>Code: {report.code}</p>
          <p>Hint: {report.hint}</p>
        </>
      )}
    </>
  );
  return <p>Loaded {texs?.length ?? 0} textures</p>;
}`;

export const reactiveUIVue = `\
<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  import { useTexture } from '@motion-core/motion-gpu/vue';

  const result = useTexture(['/assets/albedo.png']);
  const isLoading = ref(result.loading.current);
  const err = ref(result.error.current);
  const report = ref(result.errorReport.current);
  const texs = ref(result.textures.current);

  const unsubs: (() => void)[] = [];
  onMounted(() => {
    unsubs.push(result.loading.subscribe((v) => (isLoading.value = v)));
    unsubs.push(result.error.subscribe((v) => (err.value = v)));
    unsubs.push(result.errorReport.subscribe((v) => (report.value = v)));
    unsubs.push(result.textures.subscribe((v) => (texs.value = v)));
  });
  onBeforeUnmount(() => unsubs.forEach((u) => u()));
</script>

<template>
  <p v-if="isLoading">Loading textures...</p>
  <template v-else-if="err">
    <p>Error: {{ err.message }}</p>
    <template v-if="report">
      <p>Code: {{ report.code }}</p>
      <p>Hint: {{ report.hint }}</p>
    </template>
  </template>
  <p v-else>Loaded {{ texs?.length ?? 0 }} textures</p>
</template>`;
