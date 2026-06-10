#include <noise>

fn safeNormalize(v: vec3f, fallback: vec3f) -> vec3f {
	let l2 = dot(v, v);
	if (l2 < 1e-8) {
		return fallback;
	}
	return v * inverseSqrt(l2);
}

fn grainNormal(p: vec3f, e: f32) -> vec3f {
	let ep = vec2f(e, -e);
	return safeNormalize(
		ep.xyy * surfaceGrain(p + ep.xyy) +
		ep.yyx * surfaceGrain(p + ep.yyx) +
		ep.yxy * surfaceGrain(p + ep.yxy) +
		ep.xxx * surfaceGrain(p + ep.xxx),
		vec3f(0.0, 1.0, 0.0)
	);
}
