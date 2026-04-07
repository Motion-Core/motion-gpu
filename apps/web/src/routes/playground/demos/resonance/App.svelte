<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';
	import Runtime from './runtime.svelte';

	const material = defineMaterial({
		uniforms: {
			uMouse: { type: 'vec2f', value: [0.5, 0.5] },
			uMouseInside: { type: 'f32', value: 0 },
			uNextHue: { type: 'f32', value: 0 },
			uClick0: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick1: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick2: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick3: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick4: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick5: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick6: { type: 'vec4f', value: [0, 0, -1, 0] },
			uClick7: { type: 'vec4f', value: [0, 0, -1, 0] }
		},
		fragment: `
fn hsv2rgb(h: f32, s: f32, v: f32) -> vec3f {
    let hh = fract(h) * 6.0;
    let i = floor(hh);
    let f = fract(hh);
    let p = v * (1.0 - s);
    let q = v * (1.0 - s * f);
    let t = v * (1.0 - s * (1.0 - f));
    if (i < 1.0) { return vec3f(v, t, p); }
    if (i < 2.0) { return vec3f(q, v, p); }
    if (i < 3.0) { return vec3f(p, v, t); }
    if (i < 4.0) { return vec3f(p, q, v); }
    if (i < 5.0) { return vec3f(t, p, v); }
    return vec3f(v, p, q);
}

fn hash21(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn vnoise(p: vec2f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
        mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x),
        u.y
    );
}

fn gauss(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}

fn click_contrib(uva: vec2f, click: vec4f, t: f32, aspect: f32) -> vec3f {
    let birth = click.z;
    if (birth < 0.0) { return vec3f(0.0); }
    let age = t - birth;
    if (age < 0.0 || age > 3.5) { return vec3f(0.0); }

    let pos = (click.xy - vec2f(0.5)) * vec2f(aspect, 1.0);
    let col_rgb = hsv2rgb(click.w, 0.88, 1.0);
    let d = length(uva - pos);
    let global_fade = exp(-age * 1.3);

    var col = vec3f(0.0);

    let r1 = age * 0.42;
    let sigma1 = max(0.003, 0.018 * exp(-age * 1.6));
    col += col_rgb * gauss(d - r1, sigma1) * global_fade * 3.5;

    let r2 = age * 0.29;
    let sigma2 = max(0.002, 0.011 * exp(-age * 2.0));
    col += col_rgb * gauss(d - r2, sigma2) * global_fade * 2.0
        * smoothstep(0.0, 0.10, age);

    let r3 = age * 0.17;
    let sigma3 = max(0.001, 0.007 * exp(-age * 2.5));
    col += col_rgb * gauss(d - r3, sigma3) * global_fade * 1.0
        * smoothstep(0.0, 0.22, age);

    let fill = (1.0 - smoothstep(r1 * 0.55, r1, d)) * exp(-age * 5.5) * 0.45;
    col += col_rgb * fill;

    let core = exp(-d * 28.0) * exp(-age * 11.0) * 4.0;
    col += vec3f(core);

    return col;
}

fn frag(uv: vec2f) -> vec4f {
    let t = motiongpuFrame.time;
    let res = motiongpuFrame.resolution;
    let aspect = res.x / res.y;

    let uva = (uv - vec2f(0.5)) * vec2f(aspect, 1.0);

    let n1 = vnoise(uva * 2.6 + vec2f(t * 0.028, t * 0.014)) - 0.5;
    let n2 = vnoise(uva * 5.5 - vec2f(t * 0.042, t * 0.018)) - 0.5;
    var col = vec3f(0.018, 0.014, 0.048)
            + vec3f(0.010, 0.008, 0.026) * (n1 * 0.65 + n2 * 0.28);

    let dx = abs(fract(uva.x / 0.1 + 0.5) - 0.5) * 0.1;
    let dy = abs(fract(uva.y / 0.1 + 0.5) - 0.5) * 0.1;
    let dot_mask = step(dx, 0.003) * step(dy, 0.003);
    col += vec3f(0.06, 0.07, 0.16) * dot_mask * 0.5;

    let mouse = motiongpuUniforms.uMouse;
    let mpos = (mouse - vec2f(0.5)) * vec2f(aspect, 1.0);
    let mdist = length(uva - mpos);
    let mouse_inside = motiongpuUniforms.uMouseInside;
    let next_hue = motiongpuUniforms.uNextHue;
    let hcol = hsv2rgb(next_hue, 0.75, 1.0);

    col += hcol * gauss(mdist, 0.048) * mouse_inside * 0.28;
    col += hcol * gauss(mdist - 0.030, 0.0045) * mouse_inside * 1.1;

    col += click_contrib(uva, motiongpuUniforms.uClick0, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick1, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick2, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick3, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick4, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick5, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick6, t, aspect);
    col += click_contrib(uva, motiongpuUniforms.uClick7, t, aspect);

    col = col / (col + vec3f(1.0));

    return vec4f(max(col, vec3f(0.0)), 1.0);
}
`
	});
</script>

<FragCanvas {material} outputColorSpace="linear">
	<Runtime />
</FragCanvas>
