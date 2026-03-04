<script lang="ts">
	import GlassPane from '$lib/GlassPane.svelte';
	import Section from './Section.svelte';
	const image = '/sample.jpg';
</script>

<Section
	variant="default"
	id="home"
	class="bg-dashed relative flex h-72 w-full flex-col items-center justify-center gap-4 sm:h-144"
>
	<div
		class="inset-shadow absolute! inset-x-4 -top-32 bottom-4 min-h-72 overflow-hidden rounded-xl border border-border bg-background-inset p-2 sm:inset-x-8 sm:bottom-8 sm:min-h-144"
	>
		<div class="h-full rounded-lg border border-border bg-background shadow-md">
			<div class="h-full w-full overflow-hidden rounded-lg">
				<GlassPane
					{image}
					distortion={0.5}
					chromaticAberration={0.005}
					waviness={0.0}
					speed={0.5}
					rods={3}
					aria-hidden="true"
				/>
			</div>
		</div>
	</div>
</Section>
