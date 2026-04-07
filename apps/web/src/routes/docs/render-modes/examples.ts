export const alwaysSvelte = `<FragCanvas {material} renderMode="always" />`;

export const alwaysReact = `<FragCanvas material={material} renderMode="always" />`;

export const onDemandSvelte = `<FragCanvas {material} renderMode="on-demand" />`;

export const onDemandReact = `<FragCanvas material={material} renderMode="on-demand" />`;

export const onDemandInvalidateSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();

  function handlePointerMove() {
    gpu.invalidate();
  }
</script>`;

export const onDemandInvalidateReact = `\
import { useMotionGPU } from '@motion-core/motion-gpu/react';

function Component() {
  const gpu = useMotionGPU();

  function handlePointerMove() {
    gpu.invalidate();
  }

  return null;
}`;

export const manualSvelte = `\
<script lang="ts">
  import { useMotionGPU } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();

  function captureFrame() {
    gpu.advance();
  }
</script>

<button onclick={captureFrame}>Render one frame</button>`;

export const manualReact = `\
import { useMotionGPU } from '@motion-core/motion-gpu/react';

function Component() {
  const gpu = useMotionGPU();

  function captureFrame() {
    gpu.advance();
  }

  return <button onClick={captureFrame}>Render one frame</button>;
}`;

export const maxDeltaSvelte = `<FragCanvas {material} maxDelta={0.05} />`;

export const maxDeltaReact = `<FragCanvas material={material} maxDelta={0.05} />`;
