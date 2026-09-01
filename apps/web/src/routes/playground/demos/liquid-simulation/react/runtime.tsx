import { useEffect, useRef } from 'react';
import { useFrame, usePointer } from 'spektral/react';
import { RESONANCE_MEDIUM_SIZE, paintResonanceMedium } from './resonance-medium';

export default function Runtime() {
	const pointer = usePointer({ requestFrame: 'auto' });
	const mediumCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const smoothPointerRef = useRef<[number, number]>([0.5, 0.5]);
	const previousPointerRef = useRef<[number, number]>([0.5, 0.5]);
	const pointerEnergyRef = useRef(0);
	const wasInsideRef = useRef(false);

	useEffect(() => {
		const mediumCanvas = document.createElement('canvas');
		mediumCanvas.width = RESONANCE_MEDIUM_SIZE;
		mediumCanvas.height = RESONANCE_MEDIUM_SIZE;
		const context = mediumCanvas.getContext('2d');
		if (context) paintResonanceMedium(context);
		mediumCanvasRef.current = mediumCanvas;

		return () => {
			mediumCanvasRef.current = null;
		};
	}, []);

	useFrame((frame) => {
		const mediumCanvas = mediumCanvasRef.current;
		if (!mediumCanvas) return;
		const current = pointer.state.current;
		if (current.inside && !wasInsideRef.current) {
			smoothPointerRef.current = [current.uv[0], current.uv[1]];
			previousPointerRef.current = [current.uv[0], current.uv[1]];
		}
		let smoothPointer = smoothPointerRef.current;
		const strokeStart: [number, number] = [smoothPointer[0], smoothPointer[1]];
		const target: [number, number] = current.inside ? current.uv : smoothPointer;
		const positionBlend = 1 - Math.exp(-frame.delta * 16);
		smoothPointer = [
			smoothPointer[0] + (target[0] - smoothPointer[0]) * positionBlend,
			smoothPointer[1] + (target[1] - smoothPointer[1]) * positionBlend
		];
		smoothPointerRef.current = smoothPointer;
		const previousPointer = previousPointerRef.current;
		const movement =
			current.inside && wasInsideRef.current
				? Math.hypot(current.uv[0] - previousPointer[0], current.uv[1] - previousPointer[1]) /
					Math.max(frame.delta, 1 / 240)
				: 0;
		const targetEnergy = current.inside
			? Math.min(1, movement * 0.2 + (current.pressed || current.dragging ? 0.42 : 0))
			: 0;
		let pointerEnergy = pointerEnergyRef.current;
		const energyBlend = 1 - Math.exp(-frame.delta * (targetEnergy > pointerEnergy ? 14 : 7));
		pointerEnergy += (targetEnergy - pointerEnergy) * energyBlend;
		pointerEnergyRef.current = pointerEnergy;
		if (current.inside) previousPointerRef.current = [current.uv[0], current.uv[1]];
		wasInsideRef.current = current.inside;
		frame.setUniform('uPointer', [
			smoothPointer[0],
			smoothPointer[1],
			strokeStart[0],
			strokeStart[1]
		]);
		frame.setUniform('uPointerEnergy', pointerEnergy);

		frame.setTexture('medium', {
			source: mediumCanvas,
			update: 'once',
			flipY: false,
			colorSpace: 'linear'
		});
	});

	return null;
}
