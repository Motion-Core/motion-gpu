<script lang="ts">
	import Section from './Section.svelte';
	import { resolve } from '$app/paths';
	import { AppBookIcon, AppSpace3dIcon } from '$lib/components/icons';
	const docsRoute = '/docs' as const;
	const playgroundRoute = '/playground' as const;
	import Button from '../ui/Button.svelte';
	import GradientGlassPane from '$lib/GradientGlassPane.svelte';
</script>

<Section variant="default" id="cta">
	<div
		class="inset-shadow relative flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl bg-background-inset px-4 py-8 sm:px-8 sm:py-16"
	>
		<div class="absolute inset-0 overflow-hidden">
			<GradientGlassPane
				backgroundColor="var(--background)"
				accentColor="var(--accent)"
				rotation={50}
				refraction={1.0}
				chromaticAberration={0.0}
				panelWidth={1}
				waveFrequency={0.0}
				waveAmplitude={0.0}
				speed={1}
			/>
		</div>
		<h2
			class="relative text-center text-2xl font-medium tracking-tight text-balance text-foreground sm:text-4xl"
		>
			Bring your shader pipeline to <span class="text-accent">production</span>.
		</h2>
		<p
			class="relative text-center text-base font-normal tracking-normal text-pretty text-foreground-muted sm:w-2/3"
		>
			Open the playground to iterate fast, then move to docs for strict contracts, render passes,
			and deterministic frame scheduling.
		</p>
		<div data-reveal="actions" class="relative mt-4 flex items-center gap-2">
			<Button
				variant="default"
				href={resolve(playgroundRoute as '/playground')}
				size="md"
				data-sveltekit-reload
				data-sveltekit-preload-data="off"
				data-sveltekit-preload-code="off"
			>
				<AppSpace3dIcon size={16} />
				<span>Playground</span>
			</Button>
			<Button href={resolve(docsRoute as '/')} size="md" variant="secondary">
				<AppBookIcon size={16} />
				<span>Documentation</span>
			</Button>
		</div>
	</div>
</Section>
