<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { docsRouteGroups, getDocHref } from '$lib/docs/manifest';
	import SearchTrigger from '../search/SearchTrigger.svelte';
	import { cn } from '$lib/utils/cn';
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';

	const homeRoute = '/' as const;
	const currentPath = $derived(page.url.pathname);
</script>

<aside class="flex h-full flex-col border-r border-border bg-background">
	<div class="p-4">
		<a href={resolve(homeRoute)} class="inline-flex items-center gap-2">
			<div class="inline-flex items-center gap-1">
				<span
					class="inline-flex shrink-0 items-center text-accent [&>svg]:size-4 [&>svg]:fill-current"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html Logo}
				</span>
				<p class="text-sm font-normal tracking-tight">Motion GPU</p>
			</div>
			<span class="text-xs text-foreground-muted">Docs</span>
		</a>
		<div class="mt-4">
			<SearchTrigger />
		</div>
	</div>

	<nav class="flex-1 overflow-y-auto px-2 py-3">
		{#each docsRouteGroups as group (group.id)}
			<section class="mt-5 first:mt-0">
				<p class="px-2 pb-1 font-mono text-[10px] text-foreground-muted uppercase">
					{group.title}
				</p>
				<ul class="grid gap-1 px-2">
					{#each group.entries as doc (doc.slug)}
						{@const href = getDocHref(doc.slug)}
						{@const isActive = currentPath === href}
						<li>
							<a
								href={resolve(href as '/')}
								class={cn(
									'flex h-8 items-center justify-start px-2.5 text-sm tracking-tight transition-colors ',
									isActive
										? 'bg-background-muted text-foreground'
										: 'text-foreground-muted hover:bg-background-muted/55 hover:text-foreground'
								)}
							>
								{doc.title}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</nav>
</aside>
