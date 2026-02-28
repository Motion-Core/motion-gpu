<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { getDocHref } from '$lib/docs/manifest';
	import DocsSidebar from '$lib/components/docs/navigation/DocsSidebar.svelte';
	import MobileSidebar from '$lib/components/docs/navigation/MobileSidebar.svelte';
	import TableOfContents from '$lib/components/docs/TableOfContents.svelte';
	import CommandPalette from '$lib/components/docs/search/CommandPalette.svelte';
	import DocNavigation from '$lib/components/docs/navigation/DocNavigation.svelte';

	interface Props {
		data: LayoutData;
		children?: Snippet;
	}

	let { data, children }: Props = $props();

	const previousLink = $derived(
		data.previousDoc
			? { title: data.previousDoc.title, href: getDocHref(data.previousDoc.slug) }
			: null
	);
	const nextLink = $derived(
		data.nextDoc ? { title: data.nextDoc.title, href: getDocHref(data.nextDoc.slug) } : null
	);
</script>

<svelte:head>
	{#if data.currentDoc}
		<title>{data.currentDoc.title} | MotionGPU Docs</title>
		<meta name="description" content={data.currentDoc.description} />
		<meta property="og:title" content={`${data.currentDoc.title} | MotionGPU Docs`} />
		<meta property="og:description" content={data.currentDoc.description} />
	{/if}
</svelte:head>

<CommandPalette />

<main
	class="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[18rem_minmax(0,1fr)_16rem]"
>
	<MobileSidebar />

	<aside class="hidden lg:block">
		<div class="sticky top-0 h-dvh">
			<DocsSidebar />
		</div>
	</aside>

	<div id="docs-content-container" class="pt-20 lg:pt-0">
		<div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
			{#if data.currentDoc}
				<header class="space-y-3 border-b border-background-muted/90 pb-6">
					<h1 class="text-3xl tracking-tight sm:text-4xl">{data.currentDoc.title}</h1>
					<p class="max-w-3xl font-fono text-sm leading-relaxed text-foreground-muted">
						{data.currentDoc.description}
					</p>
				</header>
			{/if}

			<div class="mt-10">
				{@render children?.()}
			</div>

			<DocNavigation previous={previousLink} next={nextLink} />
		</div>
	</div>

	<aside class="hidden xl:block">
		<div class="sticky top-0 h-dvh overflow-y-auto py-8">
			<TableOfContents />
		</div>
	</aside>
</main>
