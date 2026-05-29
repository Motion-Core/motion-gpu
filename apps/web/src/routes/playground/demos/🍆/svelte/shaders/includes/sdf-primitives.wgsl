fn smin(a: f32, b: f32, k: f32) -> f32 {
	let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

fn sdSphere(p: vec3f, radius: f32) -> f32 {
	return length(p) - radius;
}

fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, radius: f32) -> f32 {
	let pa = p - a;
	let ba = b - a;
	let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
	return length(pa - ba * h) - radius;
}

fn sdTaperedStemCut(p: vec3f, a: vec3f, b: vec3f, radiusA: f32, radiusB: f32) -> f32 {
	let ba = b - a;
	let len = max(length(ba), 0.0001);
	let axis = ba / len;
	let pa = p - a;
	let xRaw = dot(pa, axis);
	let x = clamp(xRaw, 0.0, len);
	let h = x / len;
	let radial = length(pa - axis * x);
	let radius = mix(radiusA, radiusB, h);
	let side = radial - radius;
	let tipPlane = xRaw - len;
	return max(side, tipPlane);
}
