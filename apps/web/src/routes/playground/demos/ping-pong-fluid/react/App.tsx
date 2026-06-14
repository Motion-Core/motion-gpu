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

export default function App() {
	return (
		<FragCanvas
			material={material}
			passes={[simulateFluid]}
			color={{ outputEncoding: 'srgb', dynamicRange: 'sdr', canvasColorSpace: 'srgb' }}
		>
			<Runtime simulateFluid={simulateFluid} />
		</FragCanvas>
	);
}
