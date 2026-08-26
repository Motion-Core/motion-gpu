import { useEffect, useRef } from 'react';
import { useFrame } from '@motion-core/motion-gpu/react';

// “Dancer under neon lights”, Mixkit Stock Video Free License.
// https://mixkit.co/free-stock-video/dancer-under-neon-lights-50431/
const VIDEO_SOURCE = '/playground-media/data-mosh-neon-dancer.mp4';

/**
 * Streams decoded video frames into the Data Mosh material with CORS-safe settings.
 */
export default function Runtime() {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const lastVideoTime = useRef(0);
	const resetNextFrame = useRef(true);

	useEffect(() => {
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.autoplay = true;
		video.loop = true;
		video.preload = 'auto';
		video.crossOrigin = 'anonymous';
		video.src = VIDEO_SOURCE;
		videoRef.current = video;
		void video.play().catch(() => undefined);

		return () => {
			video.pause();
			video.removeAttribute('src');
			video.load();
			videoRef.current = null;
		};
	}, []);

	useFrame((frame) => {
		const video = videoRef.current;
		if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

		const looped = video.currentTime + 0.25 < lastVideoTime.current;
		frame.setUniform('uReset', resetNextFrame.current || looped || video.seeking ? 1 : 0);
		frame.setTexture('video', {
			source: video,
			update: 'perFrame',
			flipY: true,
			colorSpace: 'srgb'
		});
		lastVideoTime.current = video.currentTime;
		resetNextFrame.current = false;
	});

	return null;
}
