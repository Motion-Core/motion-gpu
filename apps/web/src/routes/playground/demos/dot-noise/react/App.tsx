//
// Original Shader by @Frostbyte
// Licensed under CC BY-NC-SA 4.0
// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// https://www.shadertoy.com/view/wfSBWc
// ACES Tonemap reference:
// https://www.shadertoy.com/view/Xc3yzM
//
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
	fragment: `
const G = mat3x3f(
	-0.57, 0.81, 0.1,
	-0.28, -0.3, 0.9,
	0.77, 0.49, 0.4
);

fn dotNoise(p: vec3f) -> f32 {
	let gp = G * p;
	let pg = transpose(G) * p;
	return dot(cos(gp), sin(1.6 * pg));
}

fn acesTonemap(o: vec3f) -> vec3f {
	let m1 = mat3x3f(
		0.59719, 0.07600, 0.02840,
		0.35458, 0.90834, 0.13383,
		0.04823, 0.01566, 0.83777
	);

	let m2 = mat3x3f(
		1.60475, -0.10208, -0.00327,
		-0.53108, 1.10813, -0.07276,
		-0.07367, -0.00605, 1.07602
	);

	let v = m1 * o;
	let aa = v * (v + 0.0245786) - 0.000090537;
	let b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return m2 * (aa / b);
}

fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let time = motiongpuFrame.time;
	let q = vec2f(uv.x, uv.y);
	let fragCoord = q * resolution;
	let d = normalize(vec3f(2.0 * fragCoord - resolution, -resolution.y));

	var i = 0.0;
	var s = 0.0;
	var p = vec3f(0.0);
	var l = vec3f(0.0);
	p.z = time * 5.0;

	loop {
		i = i + 1.0;
		if (i >= 100.0) {
			break;
		}

		let noise = dotNoise(p);
		let sweep = abs(dot(p.xy, cos(vec2f(d.z + 5.0, d.z + 16.0)) * 0.09)) * 3.0;
		s = max(0.02 + abs(noise) * 0.005, noise * 0.1 + 1.0 - sweep);
		p += d * s;

		let palette = vec3f(1.0, 0.9, 0.8) * (d.z * 0.01 + 1.9);
		l += 1.1 * (0.2 + sin(palette + vec3f(i * 0.1))) / s;
	}

	let color = pow(acesTonemap(l / 1000.0), vec3f(2.0));
	return vec4f(color, 1.0);
}
`
});

export default function App() {
	return <FragCanvas material={material} outputColorSpace="linear" dpr={1.0} />;
}
