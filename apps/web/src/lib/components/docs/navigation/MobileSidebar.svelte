<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import Menu from 'carbon-icons-svelte/lib/Menu.svelte';
	import { docsRouteGroups, getDocHref } from '$lib/docs/manifest';
	import SearchTrigger from '../search/SearchTrigger.svelte';
	import { cn } from '$lib/utils/cn';
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';

	const homeRoute = '/' as const;
	let isOpen = $state(false);
	let reducedMotion = $state(false);
	let restoreFocusOnClose = true;
	let panel = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;
	const focusableSelectors = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
	const pathname = $derived(page.url.pathname);

	function toggle() {
		if (isOpen) {
			close();
			return;
		}

		restoreFocusOnClose = true;
		isOpen = true;
	}

	function close(options: { restoreFocus?: boolean } = {}) {
		restoreFocusOnClose = options.restoreFocus ?? true;
		isOpen = false;
	}

	function handleMenuLinkSelect() {
		close({ restoreFocus: false });
	}

	function getFocusableElements(): HTMLElement[] {
		if (!panel) return [];
		return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelectors));
	}

	function handlePanelKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}

		if (event.key !== 'Tab') return;

		const focusable = getFocusableElements();
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const activeElement = document.activeElement;

		if (event.shiftKey && activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			reducedMotion = mediaQuery.matches;
		};

		syncMotion();
		mediaQuery.addEventListener('change', syncMotion);

		return () => {
			mediaQuery.removeEventListener('change', syncMotion);
		};
	});

	$effect(() => {
		void pathname;
		close({ restoreFocus: false });
	});

	$effect(() => {
		if (!isOpen) return;

		previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		document.body.style.overflow = 'hidden';

		void tick().then(() => {
			const focusable = getFocusableElements();
			if (focusable.length > 0) {
				focusable[0].focus();
				return;
			}

			panel?.focus();
		});

		return () => {
			document.body.style.overflow = '';
			if (restoreFocusOnClose && previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
			restoreFocusOnClose = true;
		};
	});
</script>

<nav class="fixed top-3 left-1/2 z-80 w-full -translate-x-1/2 px-4 lg:hidden">
	<div class="bg-background-muted/70 backdrop-blur-xl">
		<div class="flex items-center justify-between gap-3 px-3 py-2">
			<a href={resolve(homeRoute)} class="inline-flex items-center gap-2 p-2">
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
			<button
				type="button"
				class="inline-flex size-10 items-center justify-center gap-2 font-mono text-sm whitespace-nowrap text-foreground transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				aria-label={isOpen ? 'Close docs menu' : 'Open docs menu'}
				aria-expanded={isOpen}
				aria-controls="mobile-docs-panel"
				aria-haspopup="dialog"
				onclick={toggle}
			>
				{#if isOpen}
					<Close size={20} />
				{:else}
					<Menu size={20} />
				{/if}
			</button>
		</div>
	</div>
</nav>

{#if isOpen}
	<button
		type="button"
		class="fixed inset-0 z-79 bg-white/15 backdrop-blur-[2px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none lg:hidden"
		aria-label="Close mobile docs overlay"
		onclick={() => close()}
		in:fade={{ duration: reducedMotion ? 0 : 180 }}
		out:fade={{ duration: reducedMotion ? 0 : 130 }}
	></button>

	<div
		id="mobile-docs-panel"
		role="dialog"
		aria-modal="true"
		aria-label="Mobile docs navigation"
		tabindex="-1"
		class="fixed top-20 left-1/2 z-85 grid w-[min(92vw,30rem)] -translate-x-1/2 gap-3 bg-background-muted/70 p-3 backdrop-blur-xl lg:hidden"
		onkeydown={handlePanelKeydown}
		bind:this={panel}
		in:fly={{ y: reducedMotion ? 0 : -12, duration: reducedMotion ? 0 : 240, easing: cubicOut }}
		out:fly={{ y: reducedMotion ? 0 : -8, duration: reducedMotion ? 0 : 170, easing: cubicOut }}
	>
		<SearchTrigger class="bg-card/60" />

		<nav class="max-h-[min(62vh,35rem)] overflow-y-auto pr-1">
			{#each docsRouteGroups as group (group.id)}
				<section class="mt-4 first:mt-0">
					<p class="px-3 pb-1 font-mono text-[10px] text-foreground-muted uppercase">
						{group.title}
					</p>
					<ul class="grid gap-1">
						{#each group.entries as doc (doc.slug)}
							{@const href = getDocHref(doc.slug)}
							{@const isActive = pathname === href}
							<li>
								<a
									href={resolve(href as '/')}
									onclick={handleMenuLinkSelect}
									class={cn(
										'flex h-8 items-center justify-start px-2.5 text-sm tracking-tight transition-colors',
										isActive
											? 'bg-background text-foreground'
											: 'text-foreground-muted hover:bg-background/75 hover:text-foreground'
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
	</div>
{/if}
