export const basicUsageSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();
<\/script>`;

export const basicUsageReact = `\
import { useMotionGPU } from '@motion-core/motion-gpu/react';

function Component() {
  const gpu = useMotionGPU();
}`;

export const readSizeSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';
  const gpu = useMotionGPU();
<\/script>

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

export const togglePauseSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';
  const gpu = useMotionGPU();

  function togglePause() {
    gpu.autoRender.set(!gpu.autoRender.current);
  }
<\/script>

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

export const onDemandExternalSvelte = `\
<script lang="ts">
  import { useMotionGPU, useFrame } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();

  $effect(() => {
    gpu.renderMode.set('on-demand');
  });

  $effect(() => {
    const canvas = gpu.canvas;
    if (!canvas) return;

    const handler = () => gpu.invalidate();
    canvas.addEventListener('pointermove', handler);
    return () => canvas.removeEventListener('pointermove', handler);
  });

  useFrame((state) => {
    state.setUniform('uTime', state.time);
  }, { autoInvalidate: false });
<\/script>`;

export const onDemandExternalReact = `\
import { useMotionGPU, useFrame } from '@motion-core/motion-gpu/react';
import { useEffect } from 'react';

function Component() {
  const gpu = useMotionGPU();

  useEffect(() => {
    gpu.renderMode.set('on-demand');
  }, [gpu]);

  useEffect(() => {
    const canvas = gpu.canvas;
    if (!canvas) return;

    const handler = () => gpu.invalidate();
    canvas.addEventListener('pointermove', handler);
    return () => canvas.removeEventListener('pointermove', handler);
  }, [gpu]);

  useFrame((state) => {
    state.setUniform('uTime', state.time);
  }, { autoInvalidate: false });

  return null;
}`;
