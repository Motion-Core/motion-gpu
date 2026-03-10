<script>
	//
	// Original Shader by @Frostbyte
	// Licensed under CC BY-NC-SA 4.0
	// SPDX-License-Identifier: CC-BY-NC-SA-4.0
	// Source:
	// https://www.shadertoy.com/view/tXVcWR
	//
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let time = motiongpuFrame.time;

	let q = vec2f(uv.x, 1.0 - uv.y);
	var p = -vec2f(1.0, 1.0) + 2.0 * q;
	p.x *= resolution.x / resolution.y;
	p *= 0.25;

	var color = vec4f(0.0);
	var ray = vec3f(0.0);
	var distance = 0.0;
	var field = 0.0;

	for (var step = 1.0; step <= 100.0; step += 1.0) {
		ray = 2.0 * vec3f(p * distance, distance + time);

		field = 0.008 + abs(field) * 0.04;
		distance += field;
		color += (1.0 + sin(step * 0.2 + vec4f(3.0, 1.5, 1.0, 0.0))) / field;

		let c = cos(distance * 0.1 - ray.z * 0.1 - vec4f(0.0, 11.0, 33.0, 0.0));
		let rotation = mat2x2f(vec2f(c.x, c.y), vec2f(c.z, c.w));
		let rotatedXY = rotation * ray.xy;
		ray = vec3f(rotatedXY, ray.z);

		field += cos(ray.x + ray.y - 5.0 * sin(ray.z * 0.1))
			+ dot(0.5 * sin(vec3f(ray.xy + vec2f(1.5), ray.z + time * 5.0)), vec3f(15.0, 8.0, 1.0));
	}

	color = tanh((color * color) / vec4f(1e8));
	color.b *= 2.0 + sin(ray.z * 0.1);
	color *= 2.4;

	return vec4f(color.rgb, 1.0);
}
`
	});
</script>

<FragCanvas {material} outputColorSpace="linear" />
