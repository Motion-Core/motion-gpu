export const basicUsageSvelte = `\
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });
<\/script>`;

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
  import { useFrame, useMotionGPU } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();
  let mouseX = 0.5;
  let mouseY = 0.5;

  $effect(() => {
    const canvas = gpu.canvas;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / rect.width;
      mouseY = 1.0 - (e.clientY - rect.top) / rect.height;
    };

    canvas.addEventListener('pointermove', onMove);
    return () => canvas.removeEventListener('pointermove', onMove);
  });

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', [mouseX, mouseY]);
  });
<\/script>`;

export const completeRuntimeReact = `\
import { useFrame, useMotionGPU } from '@motion-core/motion-gpu/react';
import { useEffect, useRef } from 'react';

function Runtime() {
  const gpu = useMotionGPU();
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = gpu.canvas;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) / rect.width;
      mouseRef.current.y = 1.0 - (e.clientY - rect.top) / rect.height;
    };

    canvas.addEventListener('pointermove', onMove);
    return () => canvas.removeEventListener('pointermove', onMove);
  }, [gpu]);

  useFrame((state) => {
    state.setUniform('uTime', state.time);
    state.setUniform('uMouse', [mouseRef.current.x, mouseRef.current.y]);
  });

  return null;
}`;
