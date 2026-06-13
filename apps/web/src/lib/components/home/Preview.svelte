<script lang="ts">
	import GlassPane from '$lib/GlassPane.svelte';
	import Section from './Section.svelte';
</script>

<Section
	variant="default"
	id="home"
	class="relative flex h-72 w-full flex-col items-center justify-center gap-4 bg-dashed sm:h-144"
>
	<div
		class="inset-shadow absolute! inset-x-4 -top-24 bottom-4 min-h-72 overflow-hidden rounded-xl bg-background-inset p-2 sm:inset-x-8 sm:-top-32 sm:bottom-8 sm:min-h-144"
	>
		<div class="h-full rounded-lg bg-background card">
			<div class="h-full w-full overflow-hidden rounded-lg bg-foreground dark:bg-background">
				<GlassPane
					image="/sample-image-6.webp"
					class="mix-blend-screen dark:mix-blend-lighten"
					rotation={50}
					refraction={1.0}
					chromaticAberration={0}
					panelWidth={0.4}
					waveFrequency={0.0}
					waveAmplitude={0.0}
					speed={1}
				/>
			</div>
		</div>
	</div>
</Section>
