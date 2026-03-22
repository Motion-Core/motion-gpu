<script lang="ts">
	import GlassPane from '$lib/GlassPane.svelte';
	import Section from './Section.svelte';
	const image = '/orange-portrait-001.jpg';
</script>

<Section
	variant="default"
	id="home"
	class="relative flex h-72 w-full flex-col items-center justify-center gap-4 bg-dashed sm:h-144"
>
	<div
		class="inset-shadow absolute! inset-x-4 -top-24 bottom-4 min-h-72 overflow-hidden rounded-xl bg-background-inset p-2 sm:inset-x-8 sm:-top-32 sm:bottom-8 sm:min-h-144"
	>
		<div class="card h-full rounded-lg bg-background">
			<div class="h-full w-full overflow-hidden rounded-lg bg-black dark:bg-background">
				<GlassPane
					{image}
					class="mix-blend-lighten"
					distortion={0.5}
					chromaticAberration={0.0025}
					waviness={0.0}
					speed={0.5}
					rods={2.5}
					aria-hidden="true"
				/>
			</div>
		</div>
	</div>
</Section>
