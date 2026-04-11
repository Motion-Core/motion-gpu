<script setup lang="ts">
//
// Shader by @madebyhex
// Licensed under CC BY-NC-SA 4.0
// SPDX-License-Identifier: CC-BY-NC-SA-4.0
//
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/vue';
import Runtime from './runtime.vue';

const material = defineMaterial({
	uniforms: {
		uClick0: { type: 'vec4f', value: [0, 0, 1, -100] },
		uClick1: { type: 'vec4f', value: [0, 0, 1, -100] },
		uClick2: { type: 'vec4f', value: [0, 0, 1, -100] },
		uClick3: { type: 'vec4f', value: [0, 0, 1, -100] },
		uClick4: { type: 'vec4f', value: [0, 0, 1, -100] },
		uClick5: { type: 'vec4f', value: [0, 0, 1, -100] },
		uViewportScale: { type: 'f32', value: 1.0 }
	},
	fragment: `
const MAX_STEPS: i32 = 256;
const CLOSENESS: f32 = 0.00001;
const EPSILON: f32 = 0.005;

fn noise(x: vec3f) -> f32 {
	let p = floor(x);
	var f = fract(x);
	f = f * f * (vec3f(3.0) - 2.0 * f);

	let n = p.x + p.y * 157.0 + 113.0 * p.z;
	let v1 = fract(753.5453123 * sin(n + vec4f(0.0, 1.0, 157.0, 158.0)));
	let v2 = fract(753.5453123 * sin(n + vec4f(113.0, 114.0, 270.0, 271.0)));
	let v3 = mix(v1, v2, f.z);
	let v4 = mix(v3.xy, v3.zw, f.y);
	return mix(v4.x, v4.y, f.x);
}

fn rockyBasis() -> mat3x3f {
	return mat3x3f(
		vec3f(0.28862355854826727, 0.6997227302779844, 0.6535170557707412),
		vec3f(0.06997493955670424, 0.6653237235314099, -0.7432683571499161),
		vec3f(-0.9548821651308448, 0.26025457467376617, 0.14306504491456504)
	);
}

fn field(p: vec3f) -> f32 {
	let basis = rockyBasis();
	let p1 = basis * p;
	let p2 = basis * p1;
	let n1 = noise(p1 * 5.0);
	let n2 = noise(p2 * 10.0);
	let n3 = noise(p1 * 20.0);
	let n4 = noise(p1 * 40.0);
	let rocky = 0.1 * n1 * n1 + 0.05 * n2 * n2 + 0.02 * n3 * n3 + 0.01 * n4 * n4;
	let sphereDistance = length(p) - 1.0;
	return sphereDistance + select(0.0, rocky * 0.2, sphereDistance < 0.1);
}

fn fieldLores(p: vec3f) -> f32 {
	let basis = rockyBasis();
	let p1 = basis * p;
	let n1 = noise(p1 * 5.0);
	let rocky = 0.1 * n1 * n1;
	return length(p) - 1.0 + rocky * 0.2;
}

fn getNormal(p: vec3f, value: f32, rot: mat3x3f) -> vec3f {
	let sampled = vec3f(
		field(rot * vec3f(p.x + EPSILON, p.y, p.z)),
		field(rot * vec3f(p.x, p.y + EPSILON, p.z)),
		field(rot * vec3f(p.x, p.y, p.z + EPSILON))
	);
	return normalize(sampled - vec3f(value));
}

fn clickWave(objNormal: vec3f, surfNormal: vec3f, clickData: vec4f, time: f32) -> vec3f {
	let birth = clickData.w;
	if (birth < 0.0) {
		return vec3f(0.0);
	}

	let age = time - birth;
	if (age < 0.0 || age > 6.0) {
		return vec3f(0.0);
	}

	let center = normalize(clickData.xyz);
	let arc = acos(clamp(dot(objNormal, center), -1.0, 1.0));
	let ringRadius = age * 1.55;
	let width = mix(0.23, 0.045, clamp(age * 0.28, 0.0, 1.0));
	let ring = exp(-pow((arc - ringRadius) / max(width, 0.0001), 2.0) * 3.8);
	let shoulder = exp(-pow((arc - (ringRadius - 0.18)) / max(width * 1.6, 0.0001), 2.0) * 1.2);

	let swirlNoise = noise(objNormal * 12.0 + center * 7.0 + vec3f(age * 0.4, age * 0.25, age * 0.31));
	let swirl = 0.55 + 0.45 * sin(arc * 45.0 - age * 18.0 + swirlNoise * 10.0);
	let fresnel = pow(1.0 - max(dot(surfNormal, normalize(vec3f(0.0, 0.0, 1.0))), 0.0), 1.8);
	let decay = exp(-age * 0.25);

	let bloodMist = (ring * 2.15 + shoulder * 0.7) * swirl * decay;
	let bloodCore = ring * decay * (0.15 + 0.35 * fresnel);

	return bloodMist * vec3f(0.75, 0.0, 0.0) + bloodCore * vec3f(2.4, 0.015, 0.035);
}

fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let time = motiongpuFrame.time;
	let fragCoord = uv * resolution;
	let rayScale = 3.0 / max(motiongpuUniforms.uViewportScale, 0.0001);

	let src = vec3f(rayScale * (fragCoord - 0.5 * resolution) / resolution.y, 2.0);
	let dir = vec3f(0.0, 0.0, -1.0);

	let angle = time * 0.2;
	let rot = mat3x3f(
		vec3f(-sin(angle), 0.0, cos(angle)),
		vec3f(0.0, 1.0, 0.0),
		vec3f(cos(angle), 0.0, sin(angle))
	);

	var t = 0.0;
	var atmos = 0.0;
	var loc = src;
	var value = 1.0;

	for (var i: i32 = 0; i < MAX_STEPS; i += 1) {
		loc = src + t * dir;
		if (loc.z < -1.0) {
			break;
		}

		value = field(rot * loc);
		if (value <= CLOSENESS) {
			break;
		}

		if (value > 0.00001) {
			atmos += 0.03;
		}

		t += value * 0.5;
	}

	let occlusionDir = normalize(vec3f(0.0, 5.0, 1.0));
	let shad1 = max(0.0, fieldLores(rot * (loc + occlusionDir * 0.1))) / 0.1;
	let shad2 = max(0.0, fieldLores(rot * (loc + occlusionDir * 0.15))) / 0.15;
	let shad3 = max(0.0, fieldLores(rot * (loc + occlusionDir * 0.2))) / 0.2;
	var shad = clamp((shad1 + shad2 + shad3) * 0.333333, 0.0, 1.0);
	shad = mix(shad, 1.0, 0.3);

	let ambient = clamp(field(rot * (loc - 0.5 * dir)) / 0.5 * 1.2, 0.0, 1.0);

	var fragColor = vec4f(0.01, 0.012, 0.016, 1.0);
	var waveEnergy = 0.0;
	if (value <= CLOSENESS) {
		let normal = getNormal(loc, value, rot);
		let objNormal = normalize(rot * loc);
		let lightDir = normalize(vec3f(0.0, 3.0, 1.0));
		let viewDir = normalize(src - loc);
		let light = max(dot(normal, lightDir), 0.0);

		let rockyMix = clamp(1.0 - (1.0 - length(loc)) * 18.0, 0.0, 1.0);
		let body = mix(
			vec3f(0.018, 0.018, 0.021),
			vec3f(0.055, 0.05, 0.056),
			rockyMix * 0.65
		);
		let specular = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 72.0) * 0.18;
		let fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.1);
		let rim = vec3f(1.0) * fresnel * 1.65;

		let wave = clickWave(objNormal, normal, motiongpuUniforms.uClick0, time)
			+ clickWave(objNormal, normal, motiongpuUniforms.uClick1, time)
			+ clickWave(objNormal, normal, motiongpuUniforms.uClick2, time)
			+ clickWave(objNormal, normal, motiongpuUniforms.uClick3, time)
			+ clickWave(objNormal, normal, motiongpuUniforms.uClick4, time)
			+ clickWave(objNormal, normal, motiongpuUniforms.uClick5, time);
		waveEnergy = clamp(length(wave), 0.0, 4.0);

		let totalLight = mix(ambient * 0.6, shad * light, 0.78) + waveEnergy * 0.14;
		let lit = body * (0.07 + totalLight * 0.93);
		fragColor = vec4f(lit + rim + vec3f(specular) + wave * 1.05, 1.0);
	}

	let p = 2.0 * (fragCoord / resolution.y - vec2f(0.5 / resolution.y * resolution.x, 0.5));
	let q = max(
		0.1,
		min(
			1.0,
			dot(
				vec3f(p, sqrt(max(1.0 - dot(p, p), 0.0))),
				vec3f(0.0, 2.0, 1.0)
			)
		)
	);

	let atmosLight = shad
		* max(0.0, dot(normalize(src), normalize(vec3f(0.0, 2.0, 1.0))))
		* pow(max(atmos, 0.0), 1.5);
	let atmosWave = pow(waveEnergy * 0.5, 1.0);
	fragColor += q
		* vec4f(
			atmosLight * vec3f(0.45, 0.5, 0.6) + atmosWave * vec3f(1.75, 0.03, 0.05),
			1.0
		);

	return fragColor;
}
`
});
</script>

<template>
	<FragCanvas :material="material" outputColorSpace="linear" :dpr="1.0">
		<Runtime />
	</FragCanvas>
</template>
