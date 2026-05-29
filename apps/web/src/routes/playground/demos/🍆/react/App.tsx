/*
 * Created by Marek Jóźwiak @madebyhex
 *
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * SPDX-License-Identifier: CC-BY-NC-SA-4.0
 *
 * You are free to share and adapt this work under the terms of the license.
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 */
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';
import Runtime from './runtime';
import sdfPrimitives from './shaders/includes/sdf-primitives.wgsl?raw';
import transforms from './shaders/includes/transforms.wgsl?raw';
import noise from './shaders/includes/noise.wgsl?raw';
import normalUtils from './shaders/includes/normal-utils.wgsl?raw';
import foliageDetail from './shaders/includes/foliage-detail.wgsl?raw';
import fragmentShader from './shaders/fragment.wgsl?raw';

const material = defineMaterial({
	includes: {
		sdfPrimitives,
		transforms,
		noise,
		normalUtils,
		foliageDetail
	},
	defines: {
		MAX_MARCH_STEPS: { type: 'i32', value: 96 },
		MARCH_STEP_SCALE: 0.9,
		MARCH_MAX_DIST: 4.5,
		MARCH_HIT_EPS: 0.0008,
		NORMAL_EPS: 0.0012,
		STEM_CAP_SMOOTH: 0.054,
		STEM_CAP_BLEND_BAND: 0.078,
		CAP_LEAF_JOIN_SMOOTH: 0.02,
		FBM_OCTAVES: { type: 'i32', value: 3 },
		BODY_COLOR_A: { type: 'vec3f', value: [0.14, 0.06, 0.22] },
		BODY_COLOR_B: { type: 'vec3f', value: [0.42, 0.14, 0.54] },
		CAP_COLOR_A: { type: 'vec3f', value: [0.06, 0.18, 0.1] },
		CAP_COLOR_B: { type: 'vec3f', value: [0.16, 0.32, 0.18] },
		STEM_COLOR: { type: 'vec3f', value: [0.2, 0.34, 0.22] }
	},
	fragment: fragmentShader,
	uniforms: {
		uRotateY: { type: 'f32', value: 0 },
		uRotateX: { type: 'f32', value: 0 },
		uTranslateX: { type: 'f32', value: 0 },
		uTranslateY: { type: 'f32', value: 0 },
		uJellyAmp: { type: 'f32', value: 0 },
		uJellyTime: { type: 'f32', value: 0 },
		uJellyDirX: { type: 'f32', value: 1 },
		uJellyDirY: { type: 'f32', value: 0 }
	}
});

export default function App() {
	return (
		<FragCanvas
			material={material}
			color={{ outputEncoding: 'linear', dynamicRange: 'auto', canvasColorSpace: 'display-p3' }}
		>
			<Runtime />
		</FragCanvas>
	);
}
