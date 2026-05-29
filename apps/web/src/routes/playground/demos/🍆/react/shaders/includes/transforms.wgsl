fn rotateZ(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

fn rotateX(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

fn rotateY(p: vec3f, angle: f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
