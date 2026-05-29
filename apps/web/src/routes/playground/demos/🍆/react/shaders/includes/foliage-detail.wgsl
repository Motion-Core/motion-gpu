#include <transforms>
#include <normalUtils>

fn capLeafSignal(p_world: vec3f) -> f32 {
	let p = rotateZ(p_world - vec3f(0.3, 0.5, 0.0), -0.58);
	let c = p - vec3f(-0.588, 0.808, 0.05);
	let radial = length(c.xy);
	if (radial < 0.0001) {
		return 0.0;
	}

	let ang = atan2(c.y, c.x);
	let centerFade = smoothstep(0.05, 0.12, radial);
	let edgeFade = 1.0 - smoothstep(0.43, 0.63, radial);
	let petalMask = centerFade * edgeFade;

	let angWarp = (valueNoise3(vec3f(c.xy * 4.3, 1.7)) - 0.5) * 0.9;
	let lobe = 0.5 + 0.5 * cos(ang * 5.0 + angWarp + radial * 2.3);
	let lobeShape = smoothstep(0.16, 0.86, lobe);

	let radialWarp = radial * (1.0 + (valueNoise3(vec3f(c.xy * 6.0, 3.2)) - 0.5) * 0.25);
	let majorVein = 1.0 - smoothstep(0.38, 0.88, abs(sin(ang * 5.0 + radialWarp * 5.5 + angWarp * 0.7)));
	let sideVeins = 1.0 - smoothstep(0.62, 0.96, abs(sin(ang * 10.0 - radialWarp * 8.0 + angWarp * 1.2)));
	let turbulence = grainFbm(vec3f(c.xy * 7.0, c.z * 12.0) + vec3f(1.0, 7.0, 4.0)) - 0.5;

	return (majorVein * 0.52 + sideVeins * 0.20 + lobeShape * 0.28 + turbulence * 0.14) * petalMask;
}

fn capLeafNormal(p_world: vec3f, e: f32) -> vec3f {
	let ep = vec2f(e, -e);
	return safeNormalize(
		ep.xyy * capLeafSignal(p_world + ep.xyy) +
		ep.yyx * capLeafSignal(p_world + ep.yyx) +
		ep.yxy * capLeafSignal(p_world + ep.yxy) +
		ep.xxx * capLeafSignal(p_world + ep.xxx),
		vec3f(0.0, 1.0, 0.0)
	);
}

fn stemFiberSignal(p_world: vec3f) -> f32 {
	let p = rotateZ(p_world - vec3f(0.25, 0.6, 0.0), -0.58);
	let a = vec3f(-0.64, 0.60, 0.0);
	let b = vec3f(-0.60, 0.79, 0.02);
	let pa = p - a;
	let ba = b - a;
	let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
	let axisPoint = a + ba * h;
	let radialVec = p - axisPoint;
	let radial = length(radialVec);
	if (radial < 0.0003) {
		return 0.0;
	}

	let around = radialVec / radial;
	let ang = atan2(around.z, around.x);
	let groovesA = 1.0 - smoothstep(0.60, 0.98, abs(sin(ang * 6.0 + h * 2.6)));
	let groovesB = 1.0 - smoothstep(0.74, 0.99, abs(sin(ang * 12.0 - h * 4.1)));
	let fibrils = 1.0 - smoothstep(0.84, 0.998, abs(sin(ang * 21.0 + h * 18.0)));
	let knots = valueNoise3(vec3f(h * 11.0, ang * 2.5, radial * 48.0) + vec3f(3.0, 7.0, 1.0)) - 0.5;
	let turbulence = grainFbm(vec3f(h * 13.0, ang * 2.1, radial * 30.0) + vec3f(4.0, 1.0, 9.0)) - 0.5;
	let stemRadius = mix(0.062, 0.024, h);
	let maskInner = smoothstep(stemRadius * 0.30, stemRadius * 0.56, radial);
	let maskOuter = 1.0 - smoothstep(stemRadius * 0.92, stemRadius * 1.38, radial);
	let tipFade = 1.0 - smoothstep(0.90, 1.0, h);
	let mask = maskInner * maskOuter * tipFade;

	return (groovesA * 0.52 + groovesB * 0.24 + fibrils * 0.28 + knots * 0.14 + turbulence * 0.18) * mask;
}

fn stemFiberNormal(p_world: vec3f, e: f32) -> vec3f {
	let ep = vec2f(e, -e);
	return safeNormalize(
		ep.xyy * stemFiberSignal(p_world + ep.xyy) +
		ep.yyx * stemFiberSignal(p_world + ep.yyx) +
		ep.yxy * stemFiberSignal(p_world + ep.yxy) +
		ep.xxx * stemFiberSignal(p_world + ep.xxx),
		vec3f(0.0, 1.0, 0.0)
	);
}
