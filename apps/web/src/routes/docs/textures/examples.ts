export const videoTextureSvelte = `\
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  let video: HTMLVideoElement;

  useFrame((state) => {
    if (video && video.readyState >= 2) {
      state.setTexture('uVideo', video);
    }
  });
</script>

<video bind:this={video} src="/assets/loop.mp4" autoplay loop muted playsinline />`;

export const videoTextureReact = `\
import { useFrame } from '@motion-core/motion-gpu/react';
import { useRef } from 'react';

function Runtime() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useFrame((state) => {
    const video = videoRef.current;
    if (video && video.readyState >= 2) {
      state.setTexture('uVideo', video);
    }
  });

  return (
    <video
      ref={videoRef}
      src="/assets/loop.mp4"
      autoPlay
      loop
      muted
      playsInline
    />
  );
}`;
