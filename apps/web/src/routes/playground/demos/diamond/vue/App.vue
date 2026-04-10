<script setup lang="ts">
//
	// Original Shader by @Nrx
	// License: Unknown / not declared in source metadata
	// SPDX-License-Identifier: NOASSERTION
	// Source:
	// https://www.shadertoy.com/view/ltfXDM
	//
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/vue';
	import Runtime from './runtime.vue';

	const material = defineMaterial({
		defines: {
			ALPHA: 0.95,
			AMBIENT: 0.2,
			DELTA: 0.001,
			PI: 3.14159265359,
			RAY_BOUNCE_MAX: { type: 'i32', value: 10 },
			RAY_LENGTH_MAX: 20.0,
			RAY_STEP_MAX: { type: 'i32', value: 120 },
			SPECULAR_INTENSITY: 0.5,
			SPECULAR_POWER: 3.0
		},
		fragment: `
const COLOR: vec3f = vec3f(0.8, 0.8, 0.9);
const REFRACT_INDEX: vec3f = vec3f(2.407, 2.426, 2.451);
const LIGHT_DIRECTION: vec3f = vec3f(0.57735026, 0.57735026, -0.57735026);

fn rotate_x(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(p.x, c * p.y + s * p.z, -s * p.y + c * p.z);
}

fn rotate_y(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(c * p.x - s * p.z, p.y, c * p.z + s * p.x);
}

fn rotate_z(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(c * p.x + s * p.y, -s * p.x + c * p.y, p.z);
}

fn m_rotate(p: vec3f, angle: vec3f) -> vec3f {
	let rx = rotate_x(p, angle.x);
	let ry = rotate_y(rx, angle.y);
	return rotate_z(ry, angle.z);
}

fn v_rotate_y(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(c * p.x - s * p.z, p.y, c * p.z + s * p.x);
}

fn sample_env(direction: vec3f) -> vec3f {
	let up = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
	let horizon = exp(-8.0 * abs(direction.y));
	let sky = mix(vec3f(0.14, 0.18, 0.28), vec3f(0.65, 0.68, 0.8), pow(up, 0.9));
	let haze = mix(
		vec3f(0.24, 0.22, 0.34),
		vec3f(0.2, 0.31, 0.43),
		0.5 + 0.5 * sin(direction.x * 2.0 + direction.z * 1.7)
	);
	return mix(sky, haze, horizon * 0.35);
}

fn get_distance(p_in: vec3f) -> f32 {
	let mouse = motiongpuUniforms.uMouse;
	let normal_top_a = normalize(vec3f(0.0, 1.0, 1.4));
	let normal_top_b = normalize(vec3f(0.0, 1.0, 1.0));
	let normal_top_c = normalize(vec3f(0.0, 1.0, 0.5));
	let normal_bottom_a = normalize(vec3f(0.0, -1.0, 1.0));
	let normal_bottom_b = normalize(vec3f(0.0, -1.0, 1.6));

	var p = m_rotate(p_in, vec3f(mouse.y, mouse.x, 0.0));
	let top_cut = p.y - 1.0;

	let angle_step = PI / 8.0;

	var angle = angle_step * (0.5 + floor(atan2(p.x, p.z) / angle_step));
	var q = v_rotate_y(p, angle);

	let top_a = dot(q, normal_top_a) - 2.0;
	let top_c = dot(q, normal_top_c) - 1.5;
	let bottom_a = dot(q, normal_bottom_a) - 1.7;

	q = v_rotate_y(p, -angle_step * 0.5);
	angle = angle_step * floor(atan2(q.x, q.z) / angle_step);
	q = v_rotate_y(p, angle);

	let top_b = dot(q, normal_top_b) - 1.85;
	let bottom_b = dot(q, normal_bottom_b) - 1.9;

	return max(top_cut, max(top_a, max(top_b, max(top_c, max(bottom_a, bottom_b)))));
}

fn get_normal(p: vec3f) -> vec3f {
	let h = vec2f(DELTA, -DELTA);
	let n = vec3f(h.x, h.x, h.x) * get_distance(p + vec3f(h.x, h.x, h.x))
		+ vec3f(h.x, h.y, h.y) * get_distance(p + vec3f(h.x, h.y, h.y))
		+ vec3f(h.y, h.x, h.y) * get_distance(p + vec3f(h.y, h.x, h.y))
		+ vec3f(h.y, h.y, h.x) * get_distance(p + vec3f(h.y, h.y, h.x));
	return normalize(n);
}

fn raycast(origin_in: vec3f, direction_in: vec3f, normal_in: vec4f, color_in: f32, channel: vec3f) -> f32 {
	var origin = origin_in;
	var direction = direction_in;
	var normal = normal_in;
	var color = color_in * (1.0 - ALPHA);
	var intensity = ALPHA;
	var distance_factor = 1.0;
	let refract_index = dot(REFRACT_INDEX, channel);

	for (var ray_bounce = 1; ray_bounce < RAY_BOUNCE_MAX; ray_bounce = ray_bounce + 1) {
		let eta = select(refract_index, 1.0 / refract_index, distance_factor > 0.0);
		let refraction = refract(direction, normal.xyz, eta);
		if (dot(refraction, refraction) < DELTA) {
			direction = reflect(direction, normal.xyz);
			origin += direction * DELTA * 2.0;
		} else {
			direction = refraction;
			distance_factor = -distance_factor;
		}

		var dist = RAY_LENGTH_MAX;
		for (var ray_step = 0; ray_step < RAY_STEP_MAX; ray_step = ray_step + 1) {
			dist = distance_factor * get_distance(origin);
			let dist_min = max(dist, DELTA);
			normal = vec4f(normal.xyz, normal.w + dist_min);
			if (dist < 0.0 || normal.w > RAY_LENGTH_MAX) {
				break;
			}
			origin += direction * dist_min;
		}

		if (dist >= 0.0) {
			break;
		}

		normal = vec4f(distance_factor * get_normal(origin), normal.w);

		if (distance_factor > 0.0) {
			let reflection_diffuse = max(0.0, dot(normal.xyz, LIGHT_DIRECTION));
			let reflection_specular = pow(
				max(0.0, dot(reflect(direction, normal.xyz), LIGHT_DIRECTION)),
				SPECULAR_POWER
			) * SPECULAR_INTENSITY;
			let local_color = (AMBIENT + reflection_diffuse) * dot(COLOR, channel) + reflection_specular;
			color += local_color * (1.0 - ALPHA) * intensity;
			intensity *= ALPHA;
		}
	}

	let back_color = dot(sample_env(direction), channel);
	return color + back_color * intensity;
}

fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let frag_coord = uv * resolution;

	let frag = (2.0 * frag_coord - resolution) / resolution.y;
	var direction = normalize(vec3f(frag, 2.0));

	var origin = vec3f(8.0, 2.5, 8.0);
	let forward = -origin;
	let up = vec3f(0.0, 1.0, 0.0);
	let rotation_z = normalize(forward);
	let rotation_x = normalize(cross(up, forward));
	let rotation_y = cross(rotation_z, rotation_x);
	let rotation = mat3x3f(rotation_x, rotation_y, rotation_z);
	direction = rotation * direction;

	var normal = vec4f(0.0);
	var dist = RAY_LENGTH_MAX;

	for (var ray_step = 0; ray_step < RAY_STEP_MAX; ray_step = ray_step + 1) {
		dist = get_distance(origin);
		let dist_min = max(dist, DELTA);
		normal = vec4f(normal.xyz, normal.w + dist_min);
		if (dist < 0.0 || normal.w > RAY_LENGTH_MAX) {
			break;
		}
		origin += direction * dist_min;
	}

	var rgb = vec3f(0.0);

	if (dist >= 0.0) {
		rgb = sample_env(direction);
	} else {
		normal = vec4f(get_normal(origin), normal.w);
		let reflection_diffuse = max(0.0, dot(normal.xyz, LIGHT_DIRECTION));
		let reflection_specular = pow(
			max(0.0, dot(reflect(direction, normal.xyz), LIGHT_DIRECTION)),
			SPECULAR_POWER
		) * SPECULAR_INTENSITY;
		rgb = (AMBIENT + reflection_diffuse) * COLOR + reflection_specular;

		rgb.r = raycast(origin, direction, normal, rgb.r, vec3f(1.0, 0.0, 0.0));
		rgb.g = raycast(origin, direction, normal, rgb.g, vec3f(0.0, 1.0, 0.0));
		rgb.b = raycast(origin, direction, normal, rgb.b, vec3f(0.0, 0.0, 1.0));
	}

	return vec4f(max(rgb, vec3f(0.0)), 1.0);
}
`,
		uniforms: {
			uMouse: { type: 'vec2f', value: [0, 0] }
		}
	});
</script>

<template>
<FragCanvas :material="material" outputColorSpace="linear">
	<Runtime />
</FragCanvas>
</template>
