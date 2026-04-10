import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
	defines: {
		RAY_ANCHOR_X: 0.5,
		RAY_ANCHOR_Y: 1.2,
		RAY_DIR_X: 0.0,
		RAY_DIR_Y: -1.0,
		RAYS_COLOR_R: 1.0,
		RAYS_COLOR_G: 1.0,
		RAYS_COLOR_B: 1.0,
		RAYS_SPEED: 1.0,
		LIGHT_SPREAD: 1.0,
		RAY_LENGTH: 1.0,
		PULSATING: false,
		FADE_DISTANCE: 1.0,
		SATURATION: 1.0,
		NOISE_AMOUNT: 0.0,
		DISTORTION: 0.0
	},
	fragment: `
fn noise2(st: vec2f) -> f32 {
	return fract(sin(dot(st, vec2f(12.9898, 78.233))) * 43758.5453123);
}

fn rayStrength(
	raySource: vec2f,
	rayDir: vec2f,
	coord: vec2f,
	seedA: f32,
	seedB: f32,
	speed: f32,
	time: f32,
	maxDim: f32,
) -> f32 {
	let sourceToCoord = coord - raySource;
	let dirNorm = normalize(sourceToCoord);
	let cosAngle = dot(dirNorm, rayDir);

	let distortedAngle = cosAngle
		+ DISTORTION * sin(time * 2.0 + length(sourceToCoord) * 0.01) * 0.2;

	let spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(LIGHT_SPREAD, 0.001));

	let dist = length(sourceToCoord);
	let maxDist = maxDim * RAY_LENGTH;
	let lengthFalloff = clamp((maxDist - dist) / maxDist, 0.0, 1.0);

	let fadeFalloff = clamp(
		(maxDim * FADE_DISTANCE - dist) / (maxDim * FADE_DISTANCE),
		0.5, 1.0
	);

	let pulse = select(1.0, 0.8 + 0.2 * sin(time * speed * 3.0), PULSATING);

	let baseStrength = clamp(
		(0.45 + 0.15 * sin(distortedAngle * seedA + time * speed)) +
		(0.3  + 0.2  * cos(-distortedAngle * seedB + time * speed)),
		0.0, 1.0
	);

	return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let time       = motiongpuFrame.time;

	let coord  = uv * resolution;
	let rayPos = vec2f(RAY_ANCHOR_X, RAY_ANCHOR_Y) * resolution;
	let rayDir = normalize(vec2f(RAY_DIR_X, RAY_DIR_Y));

	let maxDim = length(resolution);

	let rs1 = rayStrength(rayPos, rayDir, coord, 36.2214, 21.11349, 1.5 * RAYS_SPEED, time, maxDim);
	let rs2 = rayStrength(rayPos, rayDir, coord, 22.3991, 18.0234,  1.1 * RAYS_SPEED, time, maxDim);

	let strength = rs1 * 0.5 + rs2 * 0.4;

	var rgb = vec3f(strength) * vec3f(RAYS_COLOR_R, RAYS_COLOR_G, RAYS_COLOR_B);

	if (NOISE_AMOUNT > 0.0) {
		let n = noise2(coord * 0.01 + time * 0.1);
		rgb *= (1.0 - NOISE_AMOUNT + NOISE_AMOUNT * n);
	}

	if (SATURATION != 1.0) {
		let gray = dot(rgb, vec3f(0.299, 0.587, 0.114));
		rgb = mix(vec3f(gray), rgb, SATURATION);
	}

	return vec4f(rgb, 1.0);
}
`
});

export default function App() {
	return <FragCanvas material={material} outputColorSpace="linear" />;
}
