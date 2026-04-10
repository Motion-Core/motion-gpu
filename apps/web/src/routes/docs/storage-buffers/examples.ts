export const writeBufferSvelte = `\
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  const positions = new Float32Array(1024);

  useFrame((state) => {
    // Update positions on CPU
    for (let i = 0; i < positions.length; i += 4) {
      positions[i] = Math.random();
      positions[i + 1] = Math.random();
    }

    // Upload to GPU
    state.writeStorageBuffer('particles', positions);

    // Partial write with offset (in bytes)
    const subset = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    state.writeStorageBuffer('particles', subset, { offset: 64 });
  });
</script>`;

export const writeBufferReact = `\
import { useFrame } from '@motion-core/motion-gpu/react';
import { useRef } from 'react';

function Runtime() {
  const positions = useRef(new Float32Array(1024));

  useFrame((state) => {
    // Update positions on CPU
    for (let i = 0; i < positions.current.length; i += 4) {
      positions.current[i] = Math.random();
      positions.current[i + 1] = Math.random();
    }

    // Upload to GPU
    state.writeStorageBuffer('particles', positions.current);

    // Partial write with offset (in bytes)
    const subset = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    state.writeStorageBuffer('particles', subset, { offset: 64 });
  });

  return null;
}`;

export const writeBufferVue = `\
<script setup lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/vue';

  const positions = new Float32Array(1024);

  useFrame((state) => {
    // Update positions on CPU
    for (let i = 0; i < positions.length; i += 4) {
      positions[i] = Math.random();
      positions[i + 1] = Math.random();
    }

    // Upload to GPU
    state.writeStorageBuffer('particles', positions);

    // Partial write with offset (in bytes)
    const subset = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    state.writeStorageBuffer('particles', subset, { offset: 64 });
  });
</script>`;

export const readBufferSvelte = `\
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  useFrame(async (state) => {
    const buffer = await state.readStorageBuffer('particles');
    const data = new Float32Array(buffer);
    console.log('First particle:', data[0], data[1], data[2], data[3]);
  });
</script>`;

export const readBufferReact = `\
import { useFrame } from '@motion-core/motion-gpu/react';

function Runtime() {
  useFrame(async (state) => {
    const buffer = await state.readStorageBuffer('particles');
    const data = new Float32Array(buffer);
    console.log('First particle:', data[0], data[1], data[2], data[3]);
  });

  return null;
}`;

export const readBufferVue = `\
<script setup lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/vue';

  useFrame(async (state) => {
    const buffer = await state.readStorageBuffer('particles');
    const data = new Float32Array(buffer);
    console.log('First particle:', data[0], data[1], data[2], data[3]);
  });
</script>`;
