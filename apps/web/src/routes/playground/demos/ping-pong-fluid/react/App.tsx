import { useRef, useEffect, useState } from 'react';
import { FragCanvas, PingPongShaderPass, defineMaterial } from '@motion-core/motion-gpu/react';
import Runtime from './runtime';
import fluidShader from './shaders/fluid.wgsl?raw';
import fragmentShader from './shaders/fragment.wgsl?raw';

const material = defineMaterial({
	fragment: fragmentShader,
	textures: {
		uImage: {
			flipY: true,
			colorSpace: 'srgb',
			generateMipmaps: false
		},
		fluid: {
			format: 'rgba16float',
			filter: 'linear'
		}
	},
	uniforms: {
		uPointer: [0.5, 0.5, 0.5, 0.5],
		uPointerActive: 0
	},
	defines: {
		DISTORTION_AMOUNT: 2.0
	}
});

const simulateFluid = new PingPongShaderPass({
	fragment: fluidShader,
	target: 'fluid',
	format: 'rgba16float',
	filter: 'linear',
	iterations: 4
});

function constrainResolution(w: number, h: number, max: number): [number, number] {
	const longest = Math.max(w, h);
	if (longest <= max) return [w, h];
	const ratio = max / longest;
	return [Math.round(w * ratio), Math.round(h * ratio)];
}

export default function App() {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => {
			const { inlineSize, blockSize } = entry.contentBoxSize[0];
			setSize({ width: inlineSize, height: blockSize });
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!size.width || !size.height) return;
		const [w, h] = constrainResolution(size.width, size.height, 512);
		simulateFluid.setDimensions(w, h);
	}, [size.width, size.height]);

	return (
		<div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
			<FragCanvas
				material={material}
				passes={[simulateFluid]}
				color={{ outputEncoding: 'srgb', dynamicRange: 'sdr', canvasColorSpace: 'srgb' }}
			>
				<Runtime />
			</FragCanvas>
		</div>
	);
}
