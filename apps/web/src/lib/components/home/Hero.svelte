<script lang="ts">
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';
	import { resolve } from '$app/paths';
	import { AppBookIcon, AppSpace3dIcon } from '$lib/components/icons';
	import GradientGlassPane from '$lib/GradientGlassPane.svelte';
	import Button from '../ui/Button.svelte';
	import Section from './Section.svelte';
	const docsRoute = '/docs' as const;
	const playgroundRoute = '/playground' as const;
</script>

<Section
	variant="full"
	id="home"
	class="flex min-h-128 w-full flex-col items-center justify-center gap-4 sm:min-h-144 lg:min-h-156"
>
	<div class="absolute inset-0 h-full min-h-72">
		<div class="h-full w-full overflow-hidden bg-foreground dark:bg-background">
			<GradientGlassPane
				class="mix-blend-screen dark:mix-blend-lighten"
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
	</div>
	<div class="relative flex h-full w-full flex-col items-center justify-center gap-4">
		<span
			class="inline-flex shrink-0 items-center text-accent [&>svg]:size-16 [&>svg]:fill-current"
			aria-hidden="true"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html Logo}
		</span>
		<h1
			class="max-w-3xl text-center text-3xl font-medium tracking-tight text-balance text-foreground sm:text-5xl"
		>
			<span class="text-accent">Minimalist</span> framework for modern
			<span class="text-accent">WebGPU </span> visuals.
		</h1>
		<p
			class="max-w-lg text-center text-base font-normal tracking-normal text-pretty text-foreground sm:text-lg"
		>
			If you need performance, clarity, and composability in WebGPU, this is the right stack.
		</p>
		<div data-reveal="actions" class="flex items-center gap-2">
			<Button
				variant="default"
				href={resolve(playgroundRoute as '/playground')}
				size="lg"
				data-sveltekit-reload
				data-sveltekit-preload-data="off"
				data-sveltekit-preload-code="off"
			>
				<AppSpace3dIcon size={16} />
				<span>Playground</span>
			</Button>
			<Button href={resolve(docsRoute as '/')} size="lg" variant="secondary">
				<AppBookIcon size={16} />
				<span>Documentation</span>
			</Button>
		</div>
	</div>
</Section>
