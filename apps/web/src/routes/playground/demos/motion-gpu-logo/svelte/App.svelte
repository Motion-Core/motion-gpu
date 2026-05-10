<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';

	const material = defineMaterial({
		defines: {
			MAX_STEPS: { type: 'i32', value: 72 },
			MAX_DIST: 20.0,
			SURF_DIST: 0.001,
			LOGO_HALF_DEPTH: 0.2,
			LOGO_INSET_BEVEL_RADIUS: 0.0025,
			LOGO_INSET_BEVEL_BITE: 0.025,
			PI: 3.14159265359
		},
		includes: {
			utils: `
struct RayHit {
	dist: f32,
	hit: bool,
};

fn saturate(v: f32) -> f32 {
	return clamp(v, 0.0, 1.0);
}

fn easeInOut(t: f32, power: f32) -> f32 {
	let tt = clamp(t, 0.0, 1.0);
	if (tt < 0.5) {
		return 0.5 * pow(2.0 * tt, power);
	}
	return 0.5 + 0.5 * (1.0 - pow(2.0 * (1.0 - tt), power));
}
`,
			transforms: `
fn rotY(a: f32) -> mat3x3f {
	let s = sin(a);
	let c = cos(a);
	return mat3x3f(
		vec3f(c, 0.0, -s),
		vec3f(0.0, 1.0, 0.0),
		vec3f(s, 0.0, c)
	);
}
`,
			logoSdf: `
fn sdBox2(p: vec2f, b: vec2f) -> f32 {
	let d = abs(p) - b;
	return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}

fn sdSegmentBox(p: vec2f, a: vec2f, b: vec2f, thickness: f32) -> f32 {
	let ab = b - a;
	let len = length(ab);
	let dir = ab / len;
	let n = vec2f(-dir.y, dir.x);
	let q = vec2f(dot(p - 0.5 * (a + b), dir), dot(p - 0.5 * (a + b), n));
	return sdBox2(q, vec2f(0.5 * len, 0.5 * thickness));
}

fn udSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
	let ab = b - a;
	let t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
	return length(p - (a + ab * t));
}

fn udQuarterArc(p: vec2f, c: vec2f, r: f32) -> f32 {
	let q = p - c;
	let eY = vec2f(0.0, r);
	let eX = vec2f(r, 0.0);
	let dArc = abs(length(q) - r);
	let dCap = min(length(q - eY), length(q - eX));
	let insideQuadrant =
		select(0.0, 1.0, q.x >= 0.0) * select(0.0, 1.0, q.y >= 0.0);
	return mix(dCap, dArc, insideQuadrant);
}

fn sdQuarterArcStroke(p: vec2f, c: vec2f, r: f32, w: f32) -> f32 {
	let q = p - c;
	let dArc = abs(length(q) - r) - w;
	let eY = vec2f(0.0, r);
	let eX = vec2f(r, 0.0);
	let dCap = min(length(q - eY), length(q - eX)) - w;
	let insideQuadrant =
		select(0.0, 1.0, q.x >= 0.0) * select(0.0, 1.0, q.y >= 0.0);
	return mix(dCap, dArc, insideQuadrant);
}

fn sdCornerFill(p: vec2f) -> f32 {
	let dH = sdBox2(
		p - vec2f(15.1719, 40.0),
		vec2f(15.1719, 4.0)
	);
	let dV = sdBox2(
		p - vec2f(40.0, 15.1719),
		vec2f(4.0, 15.1719)
	);
	let dD = sdSegmentBox(
		p,
		vec2f(11.7158, 11.7158),
		vec2f(37.1716, 37.1716),
		8.0
	);
	let dR = sdQuarterArcStroke(
		p,
		vec2f(30.3431, 30.3431),
		9.6569,
		4.0
	);
	var d = min(dH, dV);
	d = min(d, dD);
	d = min(d, dR);
	return d;
}

fn sdCorner(p: vec2f) -> f32 {
	let c = vec2f(30.3431, 30.3431);
	let d0 = vec2f(2.8284, -2.8284);
	let d1 = vec2f(-2.8284, 2.8284);
	let da = vec2f(11.7158, 11.7158);
	let hJoin = vec2f(30.3431, 36.0);
	let vJoin = vec2f(36.0, 30.3431);

	var boundary = udSegment(p, vec2f(0.0, 44.0), vec2f(30.3431, 44.0));
	boundary = min(boundary, udQuarterArc(p, c, 13.6569));
	boundary = min(boundary, udSegment(p, vec2f(44.0, 30.3431), vec2f(44.0, 0.0)));
	boundary = min(boundary, udSegment(p, vec2f(44.0, 0.0), vec2f(36.0, 0.0)));
	boundary = min(boundary, udSegment(p, vec2f(36.0, 0.0), vJoin));
	boundary = min(boundary, udSegment(p, vJoin, da + d0));
	boundary = min(boundary, udSegment(p, da + d0, da + d1));
	boundary = min(boundary, udSegment(p, da + d1, hJoin));
	boundary = min(boundary, udSegment(p, vec2f(0.0, 36.0), hJoin));
	boundary = min(boundary, udSegment(p, vec2f(0.0, 36.0), vec2f(0.0, 44.0)));

	let sign = select(1.0, -1.0, sdCornerFill(p) < 0.0);
	return boundary * sign;
}

fn sdLogo2D(p: vec2f) -> f32 {
	let q = p * 46.5 + vec2f(46.5);
	let qm = vec2f(93.0) - q;
	var d = sdCorner(q);
	d = min(d, sdCorner(vec2f(qm.x, q.y)));
	d = min(d, sdCorner(vec2f(q.x, qm.y)));
	d = min(d, sdCorner(qm));
	return d / 46.5;
}

fn sdExtrudeFlat(p: vec3f, h: f32) -> f32 {
	let d2 = sdLogo2D(p.xy);
	let dz = abs(p.z) - h;
	let base = max(d2, dz);
	let edgeInset = -d2;
	let faceInset = -dz;
	let cutterP = vec2f(edgeInset, faceInset) - vec2f(LOGO_INSET_BEVEL_RADIUS);
	let concaveCutter = length(cutterP) - (LOGO_INSET_BEVEL_RADIUS + LOGO_INSET_BEVEL_BITE);
	return max(base, -concaveCutter);
}
`,
			scene: `
fn sceneMap(p: vec3f, rotInv: mat3x3f) -> f32 {
	let lenP = length(p);
	if (lenP > 1.3) {
		return lenP - 1.1;
	}
	return sdExtrudeFlat(rotInv * p, LOGO_HALF_DEPTH);
}

fn getNormal(p: vec3f, rot: mat3x3f) -> vec3f {
	let e = 0.001;
	let k = vec2f(1.0, -1.0);
	return normalize(
		k.xyy * sceneMap(p + k.xyy * e, rot) +
		k.yyx * sceneMap(p + k.yyx * e, rot) +
		k.yxy * sceneMap(p + k.yxy * e, rot) +
		k.xxx * sceneMap(p + k.xxx * e, rot)
	);
}
`,
			raymarch: `
fn rayMarch(ro: vec3f, rd: vec3f, rot: mat3x3f) -> RayHit {
	var dO = 0.0;
	for (var i = 0; i < MAX_STEPS; i += 1) {
		let p = ro + rd * dO;
		let dS = sceneMap(p, rot);
		if (dS < SURF_DIST) {
			return RayHit(dO, true);
		}
		dO += dS;
		if (dO > MAX_DIST) { break; }
	}
	return RayHit(dO, false);
}
`,
			lighting: `
fn shadeAcrylic(p: vec3f, n: vec3f, ro: vec3f) -> vec3f {
	let keyLight = normalize(vec3f(-0.78, 0.92, 1.25));
	let warmFill = normalize(vec3f(0.55, -0.35, 0.55));
	let lowerRim = normalize(vec3f(0.0, -0.9, 0.18));
	let viewDir = normalize(ro - p);

	let keyDiffuse = saturate(dot(n, keyLight));
	let fillDiffuse = saturate(dot(n, warmFill));
	let rimDiffuse = saturate(dot(n, lowerRim));

	let keyHalf = normalize(keyLight + viewDir);
	let fillHalf = normalize(warmFill + viewDir);
	let keySpec = pow(saturate(dot(n, keyHalf)), 72.0) * 72.8;
	let sharpKeySpec = pow(saturate(dot(n, keyHalf)), 360.0) * 7.5;
	let fillSpec = pow(saturate(dot(n, fillHalf)), 140.0) * 0.9;
	let fresnel = pow(1.0 - saturate(dot(n, viewDir)), 2.2);

	let acrylicOrange = vec3f(1.0, 0.21, 0.0);
	let innerOrange = vec3f(1.0, 0.62, 0.08);
	let hotHighlight = vec3f(1.0, 0.92, 0.52);
	let whiteGlint = vec3f(1.0, 0.98, 0.86);
	let bodyLight = 0.18 * 1.65 + fillDiffuse * 0.28 + rimDiffuse * 0.18;
	let subsurfaceGlow = (0.18 + fresnel * 1.45 + pow(keyDiffuse, 3.0) * 0.35) * innerOrange;
	let specular = hotHighlight * keySpec + whiteGlint * sharpKeySpec + hotHighlight * fillSpec;
	let edgeFire = innerOrange * fresnel * 0.85;

	return acrylicOrange * bodyLight + subsurfaceGlow * 0.12 + specular + edgeFire;
}
`
		},
		fragment: `
#include <utils>
#include <transforms>
#include <logoSdf>
#include <scene>
#include <raymarch>
#include <lighting>

fn renderScene(uv: vec2f, jitter: vec2f) -> vec3f {
	let resolution = motiongpuFrame.resolution;
	let time = motiongpuFrame.time;
	let cycleDuration = 3.0;
	let phase = time / cycleDuration;
	let cycleIndex = floor(phase);
	let t = fract(phase);

	let eased = easeInOut(t, 3.0);
	let tt = (cycleIndex + eased) * PI;
	let objRot = rotY(tt);

	let rotInv = transpose(objRot);

	let fragCoord = uv * resolution + jitter;
	let centeredUv = (fragCoord - 0.5 * resolution) / resolution.y;

	let ro = vec3f(0.0, 0.0, 5.8);
	let rd = normalize(vec3f(centeredUv, -1.65));

	let bg = vec3f(0.006, 0.008, 0.013);
	var col = bg;

	let hit = rayMarch(ro, rd, rotInv);

	if (hit.hit) {
		let p = ro + rd * hit.dist;
		let n = getNormal(p, rotInv);
		col = shadeAcrylic(p, n, ro);
	}

	return col;
}

fn frag(uv: vec2f) -> vec4f {
	var col = vec3f(0.0);

	col += renderScene(uv, vec2f(-0.375, -0.125));
	col += renderScene(uv, vec2f( 0.125, -0.375));
	col += renderScene(uv, vec2f(-0.125,  0.375));
	col += renderScene(uv, vec2f( 0.375,  0.125));

	col *= 0.25;

	return vec4f(col, 1.0);
}
`
	});
</script>

<FragCanvas {material} color={{ outputEncoding: 'linear' }} dpr={2} />
