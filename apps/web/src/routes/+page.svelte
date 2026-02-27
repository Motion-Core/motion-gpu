<script lang="ts">
	import GlassPane from '$lib/GlassPane.svelte';

	const image = '/sample.jpg';
</script>

<main
	data-testid="motiongpu-demo"
	class="flex min-h-dvh w-screen flex-col items-center justify-center gap-6 bg-white px-6 py-8"
>
	<header class="grid gap-2 text-center">
		<h1 class="text-4xl leading-none tracking-tight text-black">MotionGPU Glass Pane Demo</h1>
		<p class="text-sm text-black/80">
			Port of a GLSL + Three.js glass rods refraction effect to MotionGPU + WGSL.
		</p>
	</header>

	<div
		class="aspect-16/10 w-[min(1100px,90vw)] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
	>
		<GlassPane
			{image}
			distortion={0.5}
			chromaticAberration={0.005}
			waviness={0.0}
			speed={0.5}
			rods={3}
		/>
	</div>
</main>
