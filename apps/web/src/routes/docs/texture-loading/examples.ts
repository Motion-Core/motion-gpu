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
