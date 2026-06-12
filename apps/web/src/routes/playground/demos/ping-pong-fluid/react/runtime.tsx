import { useFrame, usePointer, useTexture } from '@motion-core/motion-gpu/react';

export default function Runtime() {
	const pointer = usePointer({ requestFrame: 'auto' });
	const image = useTexture(['/sample-image-17.webp'], {
		flipY: true,
		colorSpace: 'srgb'
	});
	let previousUv: [number, number] = [0.5, 0.5];
	let smoothUv: [number, number] = [0.5, 0.5];
	let wasInside = false;

	useFrame((frame) => {
		const texture = image.textures.current?.[0];
		frame.setTexture(
			'uImage',
			texture ? { source: texture.source, flipY: true, colorSpace: 'srgb' } : null
		);
		const current = pointer.state.current;

		if (current.inside && !wasInside) {
			smoothUv = [...current.uv] as [number, number];
			previousUv = [...current.uv] as [number, number];
		}
		wasInside = current.inside;

		const targetUv: [number, number] = current.inside ? current.uv : [0.5, 0.5];
		smoothUv = [
			smoothUv[0] + (targetUv[0] - smoothUv[0]) * 0.18,
			smoothUv[1] + (targetUv[1] - smoothUv[1]) * 0.18
		];
		const active =
			current.inside &&
			(current.pressed || current.dragging || Math.hypot(...current.velocityUv) > 0.02);
		frame.setUniform('uPointer', [smoothUv[0], smoothUv[1], previousUv[0], previousUv[1]]);
		frame.setUniform('uPointerActive', active ? 1 : 0);
		previousUv = smoothUv;
	});

	return null;
}
