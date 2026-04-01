export const importsSvelte = `import { setMotionGPUUserContext, useMotionGPUUserContext } from '@motion-core/motion-gpu/svelte/advanced';`;

export const importsReact = `import {
  setMotionGPUUserContext,
  useMotionGPUUserContext,
  useSetMotionGPUUserContext
} from '@motion-core/motion-gpu/react/advanced';`;

export const consumeSharedStateSvelte = `\
<script lang="ts">
  import { setMotionGPUUserContext, useMotionGPUUserContext } from '@motion-core/motion-gpu/svelte/advanced';
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  type Config = { quality: string; debugGrid: boolean };
  const config = useMotionGPUUserContext<Config>('config');

  useFrame((state) => {
    if (config.current?.debugGrid) {
      // Apply debug grid logic
    }
  });

  function setMedium() {
    setMotionGPUUserContext('config', { quality: 'medium' }, { existing: 'merge' });
  }
<\/script>`;

export const consumeSharedStateReact = `\
import { useMotionGPUUserContext, useSetMotionGPUUserContext } from '@motion-core/motion-gpu/react/advanced';
import { useFrame } from '@motion-core/motion-gpu/react';

type Config = { quality: string; debugGrid: boolean };

function Component() {
  const config = useMotionGPUUserContext<Config>('config');
  const setUserContext = useSetMotionGPUUserContext();

  useFrame((state) => {
    if (config.current?.debugGrid) {
      // Apply debug grid logic
    }
  });

  function setMedium() {
    setUserContext('config', { quality: 'medium' }, { existing: 'merge' });
  }

  return <button onClick={setMedium}>Set Medium</button>;
}`;

// The React effect/event writes example is already in the docs as tsx
// This is the existing tsx block from user-context page
export const reactEffectWritesReact = `\
import { useSetMotionGPUUserContext } from '@motion-core/motion-gpu/react/advanced';

function ConfigButton() {
  const setUserContext = useSetMotionGPUUserContext();

  return (
    <button
      onClick={() => {
        setUserContext('config', { quality: 'medium' }, { existing: 'merge' });
      }}
    >
      Medium
    </button>
  );
}`;

export const reactEffectWritesSvelte = `\
<script lang="ts">
  import { setMotionGPUUserContext } from '@motion-core/motion-gpu/svelte/advanced';

  function setMedium() {
    setMotionGPUUserContext('config', { quality: 'medium' }, { existing: 'merge' });
  }
<\/script>

<button onclick={setMedium}>Medium</button>`;

export const fullContextReadSvelte = `\
<script lang="ts">
  import { useMotionGPUUserContext } from '@motion-core/motion-gpu/svelte/advanced';

  const ctx = useMotionGPUUserContext();
<\/script>`;

export const fullContextReadReact = `\
import { useMotionGPUUserContext } from '@motion-core/motion-gpu/react/advanced';

function Component() {
  const ctx = useMotionGPUUserContext();
}`;
