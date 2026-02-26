<script lang="ts">
	import { FragCanvas } from 'fragkit';
	import type { TextureDefinitionMap } from 'fragkit';
	import TextureBlendController from '$lib/TextureBlendController.svelte';

	const fragmentWgsl = `
fn frag(uv: vec2f) -> vec4f {
	let colorA = textureSample(uTextureA, uTextureASampler, uv);
	let colorB = textureSample(uTextureB, uTextureBSampler, uv);
	let mixFactor = clamp(fragkitUniforms.uMix, 0.0, 1.0);
	return mix(colorA, colorB, mixFactor);
}
`;

	const demoImages = ['/textures/image-1.jpg', '/textures/image-2.jpg'];
	const uniforms = {
		uMix: 0
	};
	const textures: TextureDefinitionMap = {
		uTextureA: { colorSpace: 'srgb', filter: 'linear' },
		uTextureB: { colorSpace: 'srgb', filter: 'linear' }
	};
	const demoDpr = 2;
</script>

<main
	data-testid="fragkit-demo"
	class=" flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-white p-8"
>
	<header class="grid gap-2 text-center">
		<h1 class="text-4xl leading-none font-light tracking-tight text-black">FragKit Demo</h1>
		<p class="text-sm text-black/80">WGSL texture crossfade driven by useTexture + useFrame.</p>
	</header>

	<div
		class="aspect-16/10 w-[64vw] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
	>
		<FragCanvas {fragmentWgsl} {uniforms} {textures} dpr={demoDpr} class="h-full w-full">
			<TextureBlendController urls={demoImages} />
		</FragCanvas>
	</div>
</main>
