<script lang="ts">
	import { FragCanvas } from 'fragkit';
	import UniformAnimator from '$lib/UniformAnimator.svelte';

	const fragmentWgsl = `
fn frag(uv: vec2f) -> vec4f {
	let p = uv * 2.0 - vec2f(1.0, 1.0);
	let aspect = fragkitFrame.resolution.x / fragkitFrame.resolution.y;
	let st = vec2f(p.x * aspect, p.y);
	let radius = length(st);
	let phase = fragkitUniforms.phase.x;
	let intensity = fragkitUniforms.intensity.x;
	let rings = sin(18.0 * radius + phase * 6.28318);
	let sweep = cos((st.x - st.y) * 10.0 - phase * 2.2);
	let field = 0.5 + 0.5 * (0.72 * rings + 0.28 * sweep);
	let threshold = mix(0.42, 0.63, intensity);
	let mask = smoothstep(threshold - 0.12, threshold + 0.1, field);
	let gray = mix(0.96, 0.06, mask);
	let grain = fract(sin(dot(st, vec2f(12.9898, 78.233))) * 43758.5453) * 0.025;
	let color = vec3f(gray - grain);

	return vec4f(color, 1.0);
}
`;

	const uniforms = {
		phase: 0,
		intensity: 0
	};
</script>

<main data-testid="fragkit-demo">
	<header class="intro">
		<h1>FragKit Demo</h1>
		<p>Raw WGSL shader, uniforms and a single useFrame loop.</p>
	</header>

	<div class="scene">
		<FragCanvas {fragmentWgsl} {uniforms} class="demo-canvas">
			<UniformAnimator />
		</FragCanvas>
	</div>
</main>

<style>
	main {
		box-sizing: border-box;
		width: min(1080px, 100%);
		height: 100dvh;
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 4rem) 1.25rem;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 1.35rem;
		background: #fff;
	}

	.intro {
		text-align: center;
		display: grid;
		gap: 0.45rem;
	}

	.intro h1 {
		margin: 0;
		font-size: clamp(1.55rem, 2.4vw, 2.1rem);
		font-weight: 300;
		letter-spacing: -0.03em;
		line-height: 1.05;
		color: #101010;
	}

	.intro p {
		margin: 0;
		font-size: 0.88rem;
		color: #555;
	}

	.scene {
		width: min(860px, 84vw);
		aspect-ratio: 16 / 10;
		border: 1px solid #dcdcdc;
		border-radius: 14px;
		overflow: hidden;
		background: #fff;
		box-shadow:
			0 1px 0 rgba(16, 16, 16, 0.08),
			0 10px 32px rgba(16, 16, 16, 0.06);
	}

	:global(.demo-canvas) {
		width: 100%;
		height: 100%;
	}
</style>
