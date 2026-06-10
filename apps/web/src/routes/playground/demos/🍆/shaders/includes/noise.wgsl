fn hash31(p: vec3f) -> f32 {
	return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453123);
}

fn valueNoise3(p: vec3f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let u = f * f * (vec3f(3.0) - 2.0 * f);

	let n000 = hash31(i + vec3f(0.0, 0.0, 0.0));
	let n100 = hash31(i + vec3f(1.0, 0.0, 0.0));
	let n010 = hash31(i + vec3f(0.0, 1.0, 0.0));
	let n110 = hash31(i + vec3f(1.0, 1.0, 0.0));
	let n001 = hash31(i + vec3f(0.0, 0.0, 1.0));
	let n101 = hash31(i + vec3f(1.0, 0.0, 1.0));
	let n011 = hash31(i + vec3f(0.0, 1.0, 1.0));
	let n111 = hash31(i + vec3f(1.0, 1.0, 1.0));

	let nx00 = mix(n000, n100, u.x);
	let nx10 = mix(n010, n110, u.x);
	let nx01 = mix(n001, n101, u.x);
	let nx11 = mix(n011, n111, u.x);
	let nxy0 = mix(nx00, nx10, u.y);
	let nxy1 = mix(nx01, nx11, u.y);
	return mix(nxy0, nxy1, u.z);
}

fn grainFbm(p: vec3f) -> f32 {
	var total = 0.0;
	var amp = 0.64;
	var freq = 1.0;
	for (var i = 0; i < FBM_OCTAVES; i = i + 1) {
		total += amp * valueNoise3(p * freq);
		freq *= 2.15;
		amp *= 0.52;
	}
	return total;
}

fn surfaceGrain(p: vec3f) -> f32 {
	let base = grainFbm(p * vec3f(4.8, 5.4, 5.1) + vec3f(5.1, 2.7, 9.3));
	let pores = valueNoise3(p * vec3f(56.0, 57.5, 15.5) + vec3f(52.0, 57.0, 3.0));
	return (base - 0.5) * 1.05 + (pores - 0.5) * 0.34;
}
