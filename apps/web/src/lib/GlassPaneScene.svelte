<script module lang="ts">
	import { defineMaterial } from '@motion-core/motion-gpu/svelte';

	export const glassPaneMaterial = defineMaterial({
		fragment: `
fn rotate2D(v: vec2f, angle: f32) -> vec2f {
	let c = cos(angle);
	let s = sin(angle);
	return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

fn getCoverUV(uv: vec2f, textureSize: vec2f, resolution: vec2f) -> vec2f {
	let safeTexture = max(textureSize, vec2f(1.0, 1.0));
	let s = resolution / safeTexture;
	let scale = max(s.x, s.y);
	let scaledSize = safeTexture * scale;
	let offset = (resolution - scaledSize) * 0.5;
	return (uv * resolution - offset) / scaledSize;
}

fn frag(uv: vec2f) -> vec4f {
	let resolution = motiongpuFrame.resolution;
	let uniforms = motiongpuUniforms;
	let aspect = resolution.x / max(resolution.y, 0.0001);

	var p = uv * 2.0 - vec2f(1.0, 1.0);
	p.x = p.x * aspect;

	let angle = 0.0;
	let pRot = rotate2D(p, angle);

	let wave = uniforms.uWaviness * sin(pRot.y * uniforms.uFrequency);
	let rodX = fract((pRot.x + wave) * uniforms.uRods) * 2.0 - 1.0;

	let rodZSq = 1.0 - rodX * rodX;
	let rodZ = sqrt(max(rodZSq, 0.0));

	let n = vec3f(rodX, 0.0, -rodZ);
	let rd = vec3f(0.0, 0.0, -1.0);
	let refractiveIndex = 0.6;
	let refractedRay = n * (1.0 - refractiveIndex) + rd * refractiveIndex;

	let zDist = 0.5 / (abs(refractedRay.z) + 0.001);
	let hitPos = vec3f(pRot, 0.0) + (zDist * uniforms.uDistortion) * refractedRay;

	var uvHit = rotate2D(hitPos.xy, -angle);
	uvHit.x = uvHit.x / aspect;
	uvHit = uvHit * 0.5 + vec2f(0.5, 0.5);

	let coverUv = getCoverUV(uvHit, uniforms.uTextureSize, resolution);

	let t = uniforms.uTime * 0.1;
	let flow = vec2f(sin(t), cos(t * 0.8)) * 0.05;
	let dispersion = uniforms.uChromaticAberration;
	let coverUvFlow = coverUv + flow;

	let r = textureSample(uTexture, uTextureSampler, coverUvFlow + vec2f(dispersion, 0.0)).r;
	let g = textureSample(uTexture, uTextureSampler, coverUvFlow).g;
	let b = textureSample(uTexture, uTextureSampler, coverUvFlow - vec2f(dispersion, 0.0)).b;

	var gFactor = 1.0 - abs(n.z);
	gFactor = smoothstep(0.0, 1.0, gFactor);
	let glass = gFactor * 0.0025;

	let finalColor = vec3f(r, g, b) + vec3f(glass);
	return vec4f(finalColor, 1.0);
}
`,
		uniforms: {
			uTime: { type: 'f32', value: 0 },
			uTextureSize: { type: 'vec2f', value: [1, 1] },
			uDistortion: { type: 'f32', value: 1.0 },
			uChromaticAberration: { type: 'f32', value: 0.005 },
			uWaviness: { type: 'f32', value: 0.05 },
			uFrequency: { type: 'f32', value: 6.0 },
			uRods: { type: 'f32', value: 5.0 }
		},
		textures: {
			uTexture: {
				filter: 'linear',
				addressModeU: 'mirror-repeat',
				addressModeV: 'mirror-repeat',
				anisotropy: 1,
				update: 'once'
			}
		}
	});
</script>

<script lang="ts">
	import { useFrame, useTexture } from '@motion-core/motion-gpu/svelte';

	interface Props {
		image: string;
		distortion?: number;
		chromaticAberration?: number;
		speed?: number;
		waviness?: number;
		frequency?: number;
		rods?: number;
	}

	let {
		image,
		distortion = 1.0,
		chromaticAberration = 0.005,
		speed = 1.0,
		waviness = 0.05,
		frequency = 6.0,
		rods = 5.0
	}: Props = $props();

	let time = 0;
	const textures = useTexture(() => [image]);
	let previousImage: string | null = null;

	$effect(() => {
		if (previousImage === null) {
			previousImage = image;
			return;
		}

		if (image === previousImage) {
			return;
		}

		previousImage = image;
		void textures.reload();
	});

	useFrame((state) => {
		time += state.delta * speed;
		state.setUniform('uTime', time);
		state.setUniform('uDistortion', distortion);
		state.setUniform('uChromaticAberration', chromaticAberration);
		state.setUniform('uWaviness', waviness);
		state.setUniform('uFrequency', frequency);
		state.setUniform('uRods', rods);

		const texture = textures.textures.current?.[0];
		if (!texture) {
			state.setUniform('uTextureSize', [1, 1]);
			state.setTexture('uTexture', null);
			return;
		}

		state.setUniform('uTextureSize', [texture.width, texture.height]);
		state.setTexture('uTexture', texture.source);
	});
</script>
