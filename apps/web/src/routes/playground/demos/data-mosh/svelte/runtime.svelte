<script lang="ts">
	import { onMount } from 'svelte';
	import { useFrame } from '@motion-core/motion-gpu/svelte';

	// “Dancer under neon lights”, Mixkit Stock Video Free License.
	// https://mixkit.co/free-stock-video/dancer-under-neon-lights-50431/
	const VIDEO_SOURCE = '/playground-media/data-mosh-neon-dancer.mp4';

	let video: HTMLVideoElement | null = null;
	let lastVideoTime = 0;
	let resetNextFrame = true;

	onMount(() => {
		video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.autoplay = true;
		video.loop = true;
		video.preload = 'auto';
		video.src = VIDEO_SOURCE;
		void video.play().catch(() => undefined);

		return () => {
			video?.pause();
			video?.removeAttribute('src');
			video?.load();
			video = null;
		};
	});

	useFrame((frame) => {
		if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

		const looped = video.currentTime + 0.25 < lastVideoTime;
		frame.setUniform('uReset', resetNextFrame || looped || video.seeking ? 1 : 0);
		frame.setTexture('video', {
			source: video,
			update: 'perFrame',
			flipY: true,
			colorSpace: 'srgb'
		});
		lastVideoTime = video.currentTime;
		resetNextFrame = false;
	});
</script>
