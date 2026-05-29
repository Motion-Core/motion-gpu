#include <sdfPrimitives>
#include <foliageDetail>

fn cameraBasis(eye: vec3f, look_at: vec3f) -> mat3x3f {
	let forward = normalize(look_at - eye);
	let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
	let up = cross(right, forward);
	return mat3x3f(right, up, forward);
}

fn bodySdf(p_world: vec3f) -> f32 {
	let p = rotateZ(p_world - vec3f(0.02, -0.05, 0.0), 0.58);
	let s0 = sdSphere(p - vec3f(0.64, -0.24, 0.0), 0.55);
	let s1 = sdSphere(p - vec3f(0.16, -0.16, 0.0), 0.47);
	let s2 = sdSphere(p - vec3f(-0.30, 0.02, 0.0), 0.35);
	let s3 = sdSphere(p - vec3f(-0.63, 0.24, 0.0), 0.25);

	var d = smin(s0, s1, 0.35);
	d = smin(d, s2, 0.28);
	d = smin(d, s3, 0.32);
	d = max(d, p.y - 0.52);
	return d;
}

fn capSdf(p_world: vec3f) -> f32 {
	let p = rotateZ(p_world - vec3f(0.27, 0.57, 0.0), -0.58);
	let center = vec3f(-0.58, 0.54, 0.0);
	let rel = p - center;

	let coreTop = sdSphere(rel - vec3f(0.0, 0.045, 0.0), 0.11);
	let coreSkirt = sdSphere(rel - vec3f(0.0, -0.005, 0.0), 0.095);
	var d = smin(coreTop, coreSkirt, 0.10);

	let stemSocket = sdSphere(rel - vec3f(-0.01, 0.095, 0.005), 0.034);
	d = max(d, -stemSocket - 0.008);

	var leafUnion = 1e9;
	for (var i = 0; i < 5; i = i + 1) {
		let fi = f32(i);
		let angle = fi * 1.2566371 + (fi - 2.0) * 0.06;
		let dir = vec2f(cos(angle), sin(angle));
		let tangent = vec2f(-dir.y, dir.x);

		let along = dot(rel.xz, dir);
		let across = dot(rel.xz, tangent);

		let len = 0.205 + 0.018 * sin(fi * 2.31 + 0.6);
		let widthRoot = 0.068 + 0.006 * cos(fi * 1.91);
		let t = clamp(along / len, 0.0, 1.0);
		let width = mix(widthRoot, 0.018, pow(t, 1.22));
		let thickness = mix(0.018, 0.007, t);
		let droop = 0.012 + t * t * 0.078;
		let arch = (1.0 - (2.0 * t - 1.0) * (2.0 * t - 1.0)) * 0.006;

		let edgeWarp = (valueNoise3(vec3f(along * 10.0, across * 18.0, fi * 1.7 + 1.2)) - 0.5) * 0.004;

		let leafPlanar = sdCapsule(
			vec3f(along, across + edgeWarp, 0.0),
			vec3f(0.0, 0.0, 0.0),
			vec3f(len, 0.0, 0.0),
			width
		);
		let leafMidY = 0.012 - droop + arch;
		let leafSheet = abs(rel.y - leafMidY) - thickness;
		var leaf = max(leafPlanar, leafSheet);

		let backTrim = -along - 0.014;
		let upperTrim = rel.y - (0.082 - t * 0.025);
		let lowerTrim = (-0.13) - rel.y;
		leaf = max(leaf, backTrim);
		leaf = max(leaf, upperTrim);
		leaf = max(leaf, lowerTrim);

		if (i == 0) {
			leafUnion = leaf;
		} else {
			leafUnion = smin(leafUnion, leaf, CAP_LEAF_JOIN_SMOOTH);
		}
	}

	d = smin(d, leafUnion, 0.065);

	let undersideNoise = (valueNoise3(vec3f(rel.xz * 7.0, 3.1)) - 0.5) * 0.008;
	let underside = (-0.11 + undersideNoise) - rel.y;
	return max(d, underside);
}

fn stemSdf(p_world: vec3f) -> f32 {
	let p = rotateZ(p_world - vec3f(0.3, 0.65, 0.0), -0.58);
	let a = vec3f(-0.64, 0.60, 0.0);
	let b = vec3f(-0.60, 0.79, 0.02);
	let frustum = sdTaperedStemCut(p, a, b, 0.062, 0.024);
	let collar = sdSphere(p - (a + vec3f(-0.01, -0.01, 0.0)), 0.055);
	return smin(frustum, collar, 0.04);
}

fn worldToModel(p_world: vec3f) -> vec3f {
	let pivot = vec3f(0.02, -0.08, 0.0);
	let modelOffset = vec3f(motiongpuUniforms.uTranslateX, motiongpuUniforms.uTranslateY, 0.0);
	let p = p_world - pivot - modelOffset;
	var rel = rotateY(rotateX(p, -motiongpuUniforms.uRotateX), -motiongpuUniforms.uRotateY);

	let amp = motiongpuUniforms.uJellyAmp;
	if (amp > 0.0001) {
		let dirRaw = vec2f(motiongpuUniforms.uJellyDirX, motiongpuUniforms.uJellyDirY);
		var dir = vec2f(1.0, 0.0);
		let dirLen = length(dirRaw);
		if (dirLen > 0.0001) {
			dir = dirRaw / dirLen;
		}
		let perp = vec2f(-dir.y, dir.x);
		let phase = motiongpuUniforms.uJellyTime * 11.2;

		let along = dot(rel.xy, dir);
		let across = dot(rel.xy, perp);
		let radial = length(rel);
		let localAmp = amp * exp(-radial * 1.8);
		let wobbleMask = smoothstep(-0.55, 0.72, rel.y);
		let stretchWave = sin(phase - along * 9.0) * localAmp;
		let rippleWave = sin(phase * 1.6 + along * 13.0 + rel.y * 7.0) * localAmp;

		let alongDeformed = along * (1.0 + stretchWave * 0.34);
		let acrossDeformed = across * (1.0 - stretchWave * 0.22);
		var xy = dir * alongDeformed + perp * acrossDeformed;
		xy += perp * rippleWave * 0.085 * wobbleMask;

		var y = rel.y;
		y += sin(phase * 1.8 + across * 10.0) * localAmp * 0.07;
		y -= stretchWave * 0.05;
		let z = rel.z + rippleWave * 0.05;
		rel = vec3f(xy.x, y, z);
	}

	return rel + pivot;
}

fn sceneSdf(p: vec3f) -> vec2f {
	let pModel = worldToModel(p);
	var d = bodySdf(pModel);
	var id = 0.0;

	let cap = capSdf(pModel);
	let stem = stemSdf(pModel);
	let capStem = smin(cap, stem, STEM_CAP_SMOOTH);
	if (capStem < d) {
		d = capStem;
		let capWeight = smoothstep(-STEM_CAP_BLEND_BAND, STEM_CAP_BLEND_BAND, stem - cap);
		id = mix(2.0, 1.0, capWeight);
	}

	return vec2f(d, id);
}

fn sceneDist(p: vec3f) -> f32 {
	return sceneSdf(p).x;
}

fn calcNormal(p: vec3f) -> vec3f {
	let e = vec2f(NORMAL_EPS, -NORMAL_EPS);
	return normalize(
		e.xyy * sceneDist(p + e.xyy) +
		e.yyx * sceneDist(p + e.yyx) +
		e.yxy * sceneDist(p + e.yxy) +
		e.xxx * sceneDist(p + e.xxx)
	);
}

fn bumpedNormal(pos: vec3f, nGeom: vec3f, hitId: f32) -> vec3f {
	let pModel = worldToModel(pos);
	if (hitId < 0.5) {
		let bump = grainNormal(pModel * vec3f(1.8, 2.0, 1.8), 0.0085);
		return safeNormalize(nGeom + bump * 0.085, nGeom);
	} else {
		let capWeight = clamp(2.0 - hitId, 0.0, 1.0);
		let capBump = capLeafNormal(pModel, 0.0075);
		let stemBump = stemFiberNormal(pModel, 0.0065);
		let bump = mix(stemBump, capBump, capWeight);
		let bumpStrength = mix(0.14, 0.12, capWeight);
		return safeNormalize(nGeom + bump * bumpStrength, nGeom);
	}
}

fn shadeBody(pos: vec3f, n: vec3f, v: vec3f, key: vec3f, fill: vec3f, back: vec3f) -> vec3f {
	let pModel = worldToModel(pos);
	let keyDiff = max(dot(n, key), 0.0);
	let fillDiff = max(dot(n, fill), 0.0);
	let backDiff = max(dot(n, back), 0.0);
	let grad = clamp(0.52 + 0.58 * pModel.x + 0.24 * pModel.y, 0.0, 1.0);
	let peel = 0.5 + 0.5 * surfaceGrain(pModel * vec3f(3.2, 3.8, 3.3));
	let base = mix(BODY_COLOR_A, BODY_COLOR_B, clamp(grad + (peel - 0.5) * 0.1, 0.0, 1.0));
	let shade = 0.16 + keyDiff * 0.58 + fillDiff * 0.20 + backDiff * 0.08;
	var color = base * shade;

	let spec = pow(max(dot(reflect(-key, n), v), 0.0), 44.0);
	color += vec3f(0.88, 0.80, 0.96) * spec * 0.11;
	color *= 0.9 + peel * 0.1;

	let underCapShadow = smoothstep(-0.05, 0.26, pModel.y) * smoothstep(-0.70, -0.18, pModel.x);
	color *= 1.0 - underCapShadow * 0.34;
	return color;
}

fn shadeCap(pos: vec3f, n: vec3f, v: vec3f, key: vec3f, fill: vec3f, back: vec3f) -> vec3f {
	let pModel = worldToModel(pos);
	let keyDiff = max(dot(n, key), 0.0);
	let fillDiff = max(dot(n, fill), 0.0);
	let backDiff = max(dot(n, back), 0.0);
	let grad = clamp(0.44 + 0.78 * pModel.y - 0.22 * pModel.x, 0.0, 1.0);
	let capVein = 0.5 + 0.5 * capLeafSignal(pModel);
	let base = mix(CAP_COLOR_A, CAP_COLOR_B, clamp(grad + (capVein - 0.5) * 0.12, 0.0, 1.0));
	let shade = 0.22 + keyDiff * 0.50 + fillDiff * 0.20 + backDiff * 0.06;
	var color = base * shade;

	let spec = pow(max(dot(reflect(-key, n), v), 0.0), 18.0);
	color += vec3f(0.74, 0.86, 0.78) * spec * 0.045;
	let capRelief = clamp(capVein, 0.0, 1.0);
	let capCavity = pow(1.0 - capRelief, 1.75);
	color *= (0.82 + capRelief * 0.24) * (1.0 - capCavity * 0.18);
	return color;
}

fn shadeStem(pos: vec3f, n: vec3f, v: vec3f, key: vec3f, fill: vec3f, back: vec3f) -> vec3f {
	let pModel = worldToModel(pos);
	let keyDiff = max(dot(n, key), 0.0);
	let fillDiff = max(dot(n, fill), 0.0);
	let backDiff = max(dot(n, back), 0.0);
	let stemFiber = 0.5 + 0.5 * stemFiberSignal(pModel);
	let base = STEM_COLOR;
	let shade = 0.20 + keyDiff * 0.56 + fillDiff * 0.18 + backDiff * 0.08;
	let stemRelief = clamp(stemFiber, 0.0, 1.0);
	let stemCavity = pow(1.0 - stemRelief, 1.6);
	var color = base * shade * (0.80 + stemRelief * 0.28) * (1.0 - stemCavity * 0.20);

	let spec = pow(max(dot(reflect(-key, n), v), 0.0), 14.0);
	color += vec3f(0.72, 0.80, 0.74) * spec * 0.03;
	return color;
}


fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let aspect = resolution.x / max(resolution.y, 1.0);
	let screen = vec2f((uv.x - 0.5) * aspect, uv.y - 0.5);
	let edgeBottom = vec3f(0.030, 0.006, 0.088);
	let edgeTop = vec3f(0.050, 0.010, 0.130);
	let skyGrad = smoothstep(-0.35, 0.92, uv.y);
	var bg = mix(edgeBottom, edgeTop, skyGrad);

	let glowCenter = vec2f(0.0, -0.06);
	let glowInner = exp(-pow(length(screen - glowCenter) * 2.2, 2.0));
	let glowOuter = exp(-pow(length(screen - glowCenter) * 4.8, 2.0));
	bg += vec3f(0.48, 0.16, 0.98) * glowInner * 0.70;
	bg += vec3f(0.24, 0.08, 0.58) * glowOuter * 0.34;

	let vignette = 1.0 - smoothstep(0.34, 1.14, length(screen * vec2f(0.86, 1.12)));
	bg *= 0.70 + vignette * 0.30;

	let lookAt = vec3f(0.02, -0.08, 0.0);
	let baseOffset = vec3f(0.0, 0.09, 2.55);
	let eye = lookAt + baseOffset;
	let camBasis = cameraBasis(eye, lookAt);
	let ray = normalize(camBasis * vec3f(screen, 0.55));

	var travel = 0.0;
	var hitId = -1.0;
	var pos = eye;
	for (var i = 0; i < MAX_MARCH_STEPS; i = i + 1) {
		pos = eye + ray * travel;
		let scene = sceneSdf(pos);
		if (scene.x < MARCH_HIT_EPS) {
			hitId = scene.y;
			break;
		}
		travel += scene.x * MARCH_STEP_SCALE;
		if (travel > MARCH_MAX_DIST) {
			break;
		}
	}

	if (hitId < -0.5) {
		return vec4f(bg, 1.0);
	}

	let nGeom = calcNormal(pos);
	let n = bumpedNormal(pos, nGeom, hitId);
	let v = normalize(-ray);
	let key = normalize(vec3f(0.74, 1.04, 0.64));
	let fill = normalize(vec3f(-0.88, 0.52, 0.66));
	let back = normalize(vec3f(-0.12, -0.44, 1.02));

	var color = vec3f(0.0);

	if (hitId < 0.5) {
		color = shadeBody(pos, n, v, key, fill, back);
	} else {
		let capWeight = clamp(2.0 - hitId, 0.0, 1.0);
		let capColor = shadeCap(pos, n, v, key, fill, back);
		let stemColor = shadeStem(pos, n, v, key, fill, back);
		color = mix(stemColor, capColor, capWeight);
	}

	let leftBluePos = vec3f(-2.25, 0.08, 1.15);
	let leftBlueTo = leftBluePos - pos;
	let leftBlueDist = length(leftBlueTo);
	let leftBlueDir = leftBlueTo / max(leftBlueDist, 0.0001);
	let leftBlueRange = clamp(1.0 - leftBlueDist / 4.6, 0.0, 1.0);
	let leftBlueAttn = leftBlueRange * leftBlueRange / (1.0 + leftBlueDist * leftBlueDist * 0.22);
	let leftBlueDiff = max(dot(n, leftBlueDir), 0.0);
	let leftBlueSpec = pow(max(dot(reflect(-leftBlueDir, n), v), 0.0), 26.0);
	color += vec3f(0.12, 0.38, 1.0) * leftBlueAttn * (leftBlueDiff * 1.55 + leftBlueSpec * 0.30);

	let rightRedPos = vec3f(2.25, 0.06, 1.10);
	let rightRedTo = rightRedPos - pos;
	let rightRedDist = length(rightRedTo);
	let rightRedDir = rightRedTo / max(rightRedDist, 0.0001);
	let rightRedRange = clamp(1.0 - rightRedDist / 4.6, 0.0, 1.0);
	let rightRedAttn = rightRedRange * rightRedRange / (1.0 + rightRedDist * rightRedDist * 0.22);
	let rightRedDiff = max(dot(n, rightRedDir), 0.0);
	let rightRedSpec = pow(max(dot(reflect(-rightRedDir, n), v), 0.0), 26.0);
	color += vec3f(1.0, 0.16, 0.12) * rightRedAttn * (rightRedDiff * 1.45 + rightRedSpec * 0.28);

	let rim = pow(clamp(1.0 - max(dot(n, v), 0.0), 0.0, 1.0), 2.2);
	color += vec3f(0.82, 0.88, 0.96) * rim * 0.08;

	color = color / (vec3f(1.0) + color * 0.28);

	return vec4f(color, 1.0);
}
