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

<main
	data-testid="fragkit-demo"
	class=" flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-white p-8"
>
	<header class="grid gap-2 text-center">
		<h1 class="text-4xl leading-none font-light tracking-tight text-black">FragKit Demo</h1>
		<p class="text-sm text-black/80">Raw WGSL shader, uniforms and a single useFrame loop.</p>
	</header>

	<div
		class="aspect-16/10 w-[64vw] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
	>
		<FragCanvas {fragmentWgsl} {uniforms} class="h-full w-full">
			<UniformAnimator />
		</FragCanvas>
	</div>
</main>
