<script lang="ts">
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';
	import { resolve } from '$app/paths';
	import Book from 'carbon-icons-svelte/lib/Book.svelte';
	import WatsonHealth3DPrintMesh from 'carbon-icons-svelte/lib/WatsonHealth3DPrintMesh.svelte';
	import Button from '../ui/Button.svelte';
	import Section from './Section.svelte';
	const docsRoute = '/docs' as const;
	const playgroundRoute = '/playground' as const;
</script>

<Section
	variant="default"
	id="home"
	class="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 sm:min-h-[50vh] lg:min-h-[70vh]"
>
	<div class="flex w-full flex-col items-center justify-center gap-4 pt-16 sm:pt-10">
		<span
			class="inline-flex shrink-0 items-center text-accent [&>svg]:size-16 [&>svg]:fill-current"
			aria-hidden="true"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html Logo}
		</span>
		<h1 class="max-w-3xl text-center text-2xl tracking-tight text-balance sm:text-5xl">
			A <span class="text-accent">Svelte-first</span> pipeline for modern
			<span class="text-accent">GPU visuals.</span>
		</h1>
		<p class="max-w-xl text-center text-base text-pretty text-foreground-muted sm:text-lg">
			If you need performance, clarity, and composability in WebGPU for Svelte, this is the stack.
		</p>
		<div class="flex items-center gap-2">
			<Button
				variant="default"
				href={resolve(playgroundRoute as '/playground')}
				size="lg"
				data-sveltekit-reload
				data-sveltekit-preload-data="off"
				data-sveltekit-preload-code="off"
			>
				<WatsonHealth3DPrintMesh size={16} />
				<span>Playground</span>
			</Button>
			<Button href={resolve(docsRoute as '/')} size="lg" variant="secondary">
				<Book size={16} />
				<span>Documentation</span>
			</Button>
		</div>
	</div>
</Section>
