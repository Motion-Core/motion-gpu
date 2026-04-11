<script setup>
/*
 * Created by Marek Jóźwiak @madebyhex
 *
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * SPDX-License-Identifier: CC-BY-NC-SA-4.0
 *
 * You are free to share and adapt this work under the terms of the license.
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 */
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/vue';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
    let resolution = motiongpuFrame.resolution;
    let time = motiongpuFrame.time * 0.1;

    let pixel = vec2f(uv.x * resolution.x, uv.y * resolution.y);
    let u = (pixel - resolution * 0.5) / resolution.y;

    var o = vec4f(0.0);
    var d = 0.0;
    var s = 0.0;
    var l = 0.0;

    for (var i = 1.0; i < 90.0; i += 1.0) {
        var p = vec3f(u * d, d);

        s = 0.3 + p.y;

        let pzxy = vec3f(p.z, p.x, p.y);
        let pyzz = vec3f(p.y, p.z, p.z);
        let q = cos(pzxy * pyzz);

        let offset = vec3f(0.3, 0.7, 0.5);
        let diff = abs(q - floor(q + offset) - vec3f(0.5));
        l = dot(diff, vec3f(1.0));

        var n = 2.0;
        loop {
            if (n >= 32.0) { break; }
            s += abs(dot(sin(vec3f(3.0 * time) + p * n), vec3f(0.5))) / n;
            n += n;
        }

        s = 0.025 + abs(min(l, s)) * 0.175;
        d += s;

        o += vec4f(1.0 / s);
    }

    o = tanh(vec4f(1.0, 0.412, 0.0, 1.0) * o / d / 500.0 );

    return vec4f(o.rgb, 1.0);
}
`
});
</script>

<template>
	<FragCanvas :material="material" outputColorSpace="linear" :dpr="1.0" />
</template>
