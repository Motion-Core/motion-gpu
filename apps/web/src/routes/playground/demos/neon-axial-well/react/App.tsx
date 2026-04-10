//
// Original Shader by @Frostbyte
// Licensed under CC BY-NC-SA 4.0
// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// Source:
// https://www.shadertoy.com/view/33yczz
//
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let time = motiongpuFrame.time;

	let q = vec2f(uv.x, uv.y);
	let pixel = vec2f(q.x * resolution.x + 0.5, q.y * resolution.y + 0.5);
	let centered = (pixel - 0.5 * resolution) / resolution.y;
	let axialGlow = vec4f(1.0, 1.0, 3.0, 1.0) / max(length(centered + vec2f(0.0, -0.7)), 1e-3);

	var color = vec4f(0.0);
	var p = vec3f(0.0);
	var distance = 0.0;
	var field = 0.0;

	for (var step = 1.0; step <= 100.0; step += 1.0) {
		p = 1.5 * vec3f(centered * distance, distance + time);

		field = 0.005 + abs(field) * 0.07;
		distance += field;
		color += (1.0 + sin(step * 0.5 + 1.5 * vec4f(3.0, 1.5, 1.0, 0.0))) / field + axialGlow;

		let c = cos(distance * 0.1 - 4.0 - vec4f(0.0, 11.0, 33.0, 0.0));
		let rotation = mat2x2f(vec2f(c.x, c.y), vec2f(c.z, c.w));
		let rotatedXY = p.xy * rotation;
		p = vec3f(rotatedXY, p.z);

		field += cos(p.x + p.y) * 2.0 + 1.5
			+ abs(dot(0.2 * sin(vec3f(p.xy * 1.5, p.z + time * 5.0)), vec3f(0.0, 9.0, 2.0)));
	}

	color = tanh((color * color) / vec4f(3e7));
	return vec4f(color.rgb, 1.0);
}
`
});

export default function App() {
	return <FragCanvas material={material} outputColorSpace="linear" dpr={1.0} />;
}
