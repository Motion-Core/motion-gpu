<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { slide } from 'svelte/transition';
	import { docsRouteGroups, getDocHref } from '$lib/docs/manifest';
	import SearchTrigger from '../search/SearchTrigger.svelte';
	import { cn } from '$lib/utils/cn';
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';

	const homeRoute = '/' as const;
	const currentPath = $derived(page.url.pathname);
	let openGroups = $state<Record<string, boolean>>({});

	$effect(() => {
		for (const group of docsRouteGroups) {
			if (group.entries.some((doc) => getDocHref(doc.slug) === currentPath)) {
				openGroups[group.id] = true;
			}
		}
	});
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
				<p class="text-sm font-normal tracking-tight">MotionGPU</p>
			</div>
			<span class="text-xs text-foreground-muted">Docs</span>
		</a>
		<div class="mt-4">
			<SearchTrigger />
		</div>
	</div>

	<nav class="flex-1 overflow-y-auto border-t border-border px-2 py-3">
		{#each docsRouteGroups as group (group.id)}
			<section class="mt-1 first:mt-0">
				<button
					type="button"
					aria-expanded={openGroups[group.id] ?? false}
					onclick={() => (openGroups[group.id] = !(openGroups[group.id] ?? false))}
					class="flex w-full items-center justify-between px-2 py-2"
				>
					<span class="px-0.5 text-sm font-normal tracking-tight text-foreground">
						{group.title}
					</span>
					<span
						class={cn(
							'inline-flex items-center text-foreground-muted transition-transform',
							(openGroups[group.id] ?? false) ? 'rotate-0' : '-rotate-90'
						)}
					>
						<ChevronDown size={16} />
					</span>
				</button>

				{#if openGroups[group.id]}
					<div class="relative">
						<div
							class="absolute top-0 bottom-0 w-px bg-foreground/18"
							style="left: calc(0.5rem + 0.125rem);"
						></div>
						<ul class="ml-5 grid gap-1 px-2" transition:slide={{ duration: 150 }}>
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
					</div>
				{/if}
			</section>
		{/each}
	</nav>
</aside>
