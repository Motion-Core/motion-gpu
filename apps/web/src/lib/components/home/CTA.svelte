<script lang="ts">
	import Section from './Section.svelte';
	import { resolve } from '$app/paths';
	import Book from 'carbon-icons-svelte/lib/Book.svelte';
	import WatsonHealth3DPrintMesh from 'carbon-icons-svelte/lib/WatsonHealth3DPrintMesh.svelte';
	const docsRoute = '/docs' as const;
	const playgroundRoute = '/playground' as const;
	import Button from '../ui/Button.svelte';
</script>

<Section variant="default" id="cta">
	<div
		class="inset-shadow flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border border-border bg-background-inset px-4 py-8 sm:px-8 sm:py-16"
	>
		<h2
			class="text-center text-2xl font-medium tracking-tight text-balance text-foreground sm:text-4xl"
		>
			Bring your shader pipeline to production.
		</h2>
		<p
			class="text-center text-base font-normal tracking-normal text-pretty text-foreground-muted sm:w-2/3"
		>
			Open the playground to iterate fast, then move to docs for strict contracts, render passes,
			and deterministic frame scheduling.
		</p>
		<div data-reveal="actions" class="flex items-center gap-2">
			<Button
				variant="default"
				href={resolve(playgroundRoute as '/playground')}
				size="md"
				data-sveltekit-reload
				data-sveltekit-preload-data="off"
				data-sveltekit-preload-code="off"
			>
				<WatsonHealth3DPrintMesh size={16} />
				<span>Playground</span>
			</Button>
			<Button href={resolve(docsRoute as '/')} size="md" variant="secondary">
				<Book size={16} />
				<span>Documentation</span>
			</Button>
		</div>
	</div>
</Section>
