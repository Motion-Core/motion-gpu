<script>
	//
	// Original Shader by @mrange
	// Licensed under CC0 1.0 Universal
	// SPDX-License-Identifier: CC0-1.0
	// Source:
	// https://www.shadertoy.com/view/3lVczV
	//
	import { FragCanvas, ShaderPass, defineMaterial } from '@motion-core/motion-gpu/svelte';

	const postProcessPass = new ShaderPass({
		fragment: `
fn applyPostProcess(colInput: vec3f, q: vec2f) -> vec3f {
	var col = colInput;
	col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
	col = col * 0.6 + 0.4 * col * col * (vec3f(3.0) - 2.0 * col);
	col = mix(col, vec3f(dot(col, vec3f(0.33))), vec3f(-0.4));
	col *= 0.5 + 0.5 * pow(19.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.7);
	return col;
}

fn shade(inputColor: vec4f, uv: vec2f) -> vec4f {
	let q = vec2f(uv.x, 1.0 - uv.y);
	return vec4f(applyPostProcess(inputColor.rgb, q), inputColor.a);
}
`
	});
	const passes = [postProcessPass];

	const material = defineMaterial({
		defines: {
			PI: 3.141592654,
			TAU: 6.283185307179586,
			H_VARIANT: 0.67,
			TRUCHET_LINE_WIDTH: 0.05,
			TRUCHET_RADIUS: 6.9,
			TRUCHET_REP_MIN: 8.0,
			TRUCHET_REP_MAX: 25.0,
			TRUCHET_SMOOTH_MIN: 0.05,
			TRUCHET_SMOOTH_MAX: 0.125,
			TRUCHET_ROT_SPEED: 0.02,
			TRUCHET_SCROLL_SPEED: 0.05,
			FBM_OCTAVES: { type: 'i32', value: 4 },
			FBM_ATTENUATION: -0.45,
			FBM_SCALE: 3.03,
			FBM_ROTATION: 1.0
		},
		includes: {
			core_math: `
fn rot(a: f32) -> mat2x2f {
	let c = cos(a);
	let s = sin(a);
	return mat2x2f(vec2f(c, s), vec2f(-s, c));
}

fn l2(p: vec2f) -> f32 {
	return dot(p, p);
}

fn hsv2rgb(c: vec3f) -> vec3f {
	let k = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	let p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
	return c.z * mix(k.xxx, clamp(p - k.xxx, vec3f(0.0), vec3f(1.0)), c.yyy);
}

fn tanhApprox(x: f32) -> f32 {
	let x2 = x * x;
	return clamp(x * (27.0 + x2) / (27.0 + 9.0 * x2), -1.0, 1.0);
}

fn sabs(x: f32, k: f32) -> f32 {
	let ax = abs(x);
	let smoothAbs = (0.5 / k) * x * x + 0.5 * k;
	return mix(smoothAbs, ax, step(k, ax));
}

fn circle(p: vec2f, r: f32) -> f32 {
	return length(p) - r;
}

fn hash3(coInput: vec3f) -> f32 {
	let co = coInput + vec3f(100.0);
	return fract(sin(dot(co, vec3f(12.9898, 58.233, 71.2228))) * 13758.5453);
}

fn toPolar(p: vec2f) -> vec2f {
	return vec2f(length(p), atan2(p.y, p.x));
}

fn toRect(p: vec2f) -> vec2f {
	return vec2f(p.x * cos(p.y), p.x * sin(p.y));
}

fn modFloat(x: f32, y: f32) -> f32 {
	return x - y * floor(x / y);
}

fn pmin(a: f32, b: f32, k: f32) -> f32 {
	let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

fn pmax(a: f32, b: f32, k: f32) -> f32 {
	return -pmin(-a, -b, k);
}
`,
			truchet_field: `
#include <core_math>

const TRUCHET_ROTS: array<mat2x2f, 4> = array<mat2x2f, 4>(
	mat2x2f(vec2f(1.0, 0.0), vec2f(0.0, 1.0)),
	mat2x2f(vec2f(0.0, 1.0), vec2f(-1.0, 0.0)),
	mat2x2f(vec2f(-1.0, 0.0), vec2f(0.0, -1.0)),
	mat2x2f(vec2f(0.0, -1.0), vec2f(1.0, 0.0))
);

struct Mod2Result {
	p: vec2f,
	cell: vec2f,
};

struct ModMirrorResult {
	p: f32,
};

fn mod2_1(pInput: vec2f) -> Mod2Result {
	let cell = floor(pInput + vec2f(0.5));
	let p = fract(pInput + vec2f(0.5)) - vec2f(0.5);
	return Mod2Result(p, cell);
}

fn modMirror1(pInput: f32, size: f32) -> ModMirrorResult {
	let halfSize = size * 0.5;
	let cell = floor((pInput + halfSize) / size);
	var p = modFloat(pInput + halfSize, size) - halfSize;
	p *= modFloat(cell, 2.0) * 2.0 - 1.0;
	return ModMirrorResult(p);
}

fn smoothKaleidoscope(pInput: vec2f, sm: f32, rep: f32) -> vec2f {
	var hpp = toPolar(pInput);
	let ts = 2.5;
	hpp.x = tanhApprox(hpp.x / ts) * ts;

	let mirror = modMirror1(hpp.y, TAU / rep);
	hpp.y = mirror.p;

	let sa = PI / rep - sabs(PI / rep - abs(hpp.y), sm);
	hpp.y = sign(hpp.y) * sa;

	return toRect(hpp);
}

fn truchetCell0(p: vec2f) -> f32 {
	let d0 = circle(p - vec2f(0.5, 0.5), 0.5);
	let d1 = circle(p + vec2f(0.5, 0.5), 0.5);
	return min(d0, d1);
}

fn truchetCell1(p: vec2f) -> f32 {
	let d0 = abs(p.x);
	let d1 = abs(p.y);
	let d2 = circle(p, 0.25);
	return min(min(d0, d1), d2);
}

fn truchet(pInput: vec2f, h: f32, time: f32) -> vec2f {
	let hd = circle(pInput, TRUCHET_RADIUS);

	var hp = pInput;
	let rep = 2.0 * floor(mix(TRUCHET_REP_MIN, TRUCHET_REP_MAX, h));
	let sm = mix(TRUCHET_SMOOTH_MIN, TRUCHET_SMOOTH_MAX, h) * 24.0 / rep;

	hp = smoothKaleidoscope(hp, sm, rep);
	hp = rot(TRUCHET_ROT_SPEED * time) * hp;
	hp += vec2f(time * TRUCHET_SCROLL_SPEED);

	let wrapped = mod2_1(hp);
	hp = wrapped.p;
	let hn = wrapped.cell;

	let r = hash3(vec3f(hn, h));
	let rotIndex = min(3u, u32(floor(r * 4.0)));
	hp = TRUCHET_ROTS[rotIndex] * hp;

	let cd0 = truchetCell0(hp);
	let cd1 = truchetCell1(hp);
	let d0 = select(cd0, cd1, fract(r * 13.0) > 0.5);
	let d = abs(d0) - TRUCHET_LINE_WIDTH;
	return vec2f(hd, d);
}

fn df(p: vec2f, h: f32, time: f32) -> f32 {
	return truchet(p, h, time).y;
}

fn hf(p: vec2f, h: f32, time: f32) -> f32 {
	let decay = 0.75 / (1.0 + 0.125 * l2(p));
	let d = df(p, h, time);
	let ww = 0.085;
	let height = smoothstep(0.0, ww, d);
	return pmax(2.0 * height * decay, 0.5, 0.25);
}

fn fbm(pInput: vec2f, h: f32, time: f32) -> f32 {
	let aa = FBM_ATTENUATION;
	let pp = FBM_SCALE * rot(FBM_ROTATION);

	var p = pInput;
	var a = 1.0;
	var d = 0.0;
	var heightAccum = 0.0;

	for (var i: i32 = 0; i < FBM_OCTAVES; i = i + 1) {
		heightAccum += a * hf(p, h, time);
		d += a;
		a *= aa;
		p = pp * p;
	}

	return heightAccum / d;
}

fn height(pInput: vec2f, time: f32) -> f32 {
	var p = pInput;
	let h = H_VARIANT;
	let wave = 0.5 + 0.5 * sin(time * 0.2);

	p.x = sabs(p.x, 0.1 * abs(p.y) + 0.001);
	p = rot(time * 0.075) * p;
	p = rot(-PI * tanhApprox(0.125 * (l2(p) - 0.25))) * p;
	p *= mix(1.5, 2.5, mix(wave, 1.0 - wave, h));

	return fbm(p, h, time);
}

fn normal(p: vec2f, time: f32, resolution: vec2f) -> vec3f {
	let eps = 4.0 / resolution.y;
	let ex = vec2f(eps, 0.0);
	let ey = vec2f(0.0, eps);

	let nx = height(p - ex, time) - height(p + ex, time);
	let ny = 2.0 * eps;
	let nz = height(p - ey, time) - height(p + ey, time);

	return normalize(vec3f(nx, ny, nz));
}
`
		},
		fragment: `
#include <truchet_field>

fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let time = motiongpuFrame.time;

	let q = vec2f(uv.x, 1.0 - uv.y);
	var p = -vec2f(1.0, 1.0) + 2.0 * q;
	p.x *= resolution.x / resolution.y;

	let ld1 = normalize(vec3f(1.0, 1.0, 1.0));
	let ld2 = normalize(vec3f(-1.0, 0.75, 1.0));

	let l = length(p);
	let h = height(p, time);
	let n = normal(p, time, resolution);

	var hsv = vec3f(
		mix(0.6, 0.9, 0.5 + 0.5 * sin(time * 0.1 - 10.0 * h * l + (p.x + p.y))),
		tanhApprox(0.5 * h),
		tanhApprox(10.0 * l * h + 0.1)
	);
	hsv = vec3f(hsv.x, clamp(hsv.y, 0.0, 1.0), clamp(hsv.z, 0.0, 1.0));

	let baseCol1 = hsv2rgb(hsv);
	let baseCol2 = sqrt(baseCol1.zyx);

	let diff1 = max(dot(n, ld1), 0.0);
	let diff2 = max(dot(n, ld2), 0.0);
	let basePow = 1.5;

	var col = vec3f(0.0);
	col += 1.00 * baseCol1 * pow(diff1, 16.0 * basePow);
	col += 0.10 * baseCol1 * pow(diff1, 4.0 * basePow);
	col += 0.15 * baseCol2 * pow(diff2, 8.0 * basePow);
	col += 0.02 * baseCol2 * pow(diff2, 2.0 * basePow);
	col *= 8.0;

	return vec4f(col, 1.0);
}
`
	});
</script>

<FragCanvas {material} {passes} outputColorSpace="linear" />
