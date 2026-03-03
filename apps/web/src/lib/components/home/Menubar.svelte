<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import Book from 'carbon-icons-svelte/lib/Book.svelte';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import LogoGithub from 'carbon-icons-svelte/lib/LogoGithub.svelte';
	import Menu from 'carbon-icons-svelte/lib/Menu.svelte';
	import Button from '../ui/Button.svelte';
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';

	const homeRoute = '/' as const;
	const docsRoute = '/docs' as const;
	const focusableSelectors = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

	let mobileOpen = $state(false);
	let reducedMotion = $state(false);
	let restoreFocusOnClose = true;
	let mobileMenuTrigger = $state<HTMLButtonElement | null>(null);
	let mobilePanel = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function toggleMobileMenu() {
		if (mobileOpen) {
			closeMobileMenu();
			return;
		}

		restoreFocusOnClose = true;
		mobileOpen = true;
	}

	function closeMobileMenu(options: { restoreFocus?: boolean } = {}) {
		restoreFocusOnClose = options.restoreFocus ?? true;
		mobileOpen = false;
	}

	function handleMenuLinkSelect() {
		closeMobileMenu({ restoreFocus: false });
	}

	function getFocusableElements(): HTMLElement[] {
		if (!mobilePanel) return [];
		return Array.from(mobilePanel.querySelectorAll<HTMLElement>(focusableSelectors));
	}

	function handleMobilePanelKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMobileMenu();
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
		if (!mobileOpen) return;

		const mainContent = document.getElementById('main-content');
		previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		document.body.style.overflow = 'hidden';
		mainContent?.setAttribute('inert', '');

		void tick().then(() => {
			const focusable = getFocusableElements();
			if (focusable.length > 0) {
				focusable[0].focus();
				return;
			}

			mobilePanel?.focus();
		});

		return () => {
			document.body.style.overflow = '';
			mainContent?.removeAttribute('inert');
			if (restoreFocusOnClose && previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
			restoreFocusOnClose = true;
		};
	});
</script>

<nav aria-label="Primary navigation" class="fixed top-0 z-60 w-full">
	<div class="mx-auto max-w-6xl border border-border bg-white">
		<div class="relative flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
			<a
				href={resolve(homeRoute)}
				class="inline-flex items-center gap-1 px-2 py-2 text-sm tracking-tight text-foreground transition-colors duration-150 ease-out hover:text-foreground"
			>
				<span
					class="inline-flex shrink-0 items-center text-accent [&>svg]:size-4 [&>svg]:fill-current"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html Logo}
				</span>
				<span class="font-medium">MotionGPU</span>
			</a>

			<div
				class="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 sm:flex"
			>
				<a
					href="#home"
					class="inline-flex items-center gap-2 px-2 py-2 text-sm tracking-tight text-foreground/70 transition-colors duration-150 ease-out hover:text-foreground"
				>
					Home
				</a>
				<a
					href="#features"
					class="inline-flex items-center gap-2 px-2 py-2 text-sm tracking-tight text-foreground/70 transition-colors duration-150 ease-out hover:text-foreground"
				>
					Features
				</a>
				<a
					href="#how-it-works"
					class="inline-flex items-center gap-2 px-2 py-2 text-sm tracking-tight text-foreground/70 transition-colors duration-150 ease-out hover:text-foreground"
				>
					Pipeline
				</a>
			</div>

			<div class="hidden items-center gap-2 sm:flex">
				<Button href={resolve(docsRoute as '/')} size="sm" variant="default">
					<Book size={16} />
					<span>Docs</span>
				</Button>
				<Button
					href="https://github.com/motion-core/motion-gpu"
					target="_blank"
					rel="noreferrer"
					variant="secondary"
					size="sm"
				>
					<LogoGithub size={16} />
					<span>GitHub</span>
				</Button>
			</div>

			<button
				type="button"
				class="inline-flex size-10 items-center justify-center gap-2 text-sm whitespace-nowrap text-foreground transition-colors duration-150 ease-out hover:bg-background-inset sm:hidden"
				aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
				aria-expanded={mobileOpen}
				aria-controls="mobile-menubar-panel"
				aria-haspopup="dialog"
				onclick={toggleMobileMenu}
				bind:this={mobileMenuTrigger}
			>
				{#if mobileOpen}
					<Close size={20} />
				{:else}
					<Menu size={20} />
				{/if}
			</button>
		</div>
	</div>
</nav>

{#if mobileOpen}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-background-inset/80 backdrop-blur-sm sm:hidden"
		aria-label="Close mobile navigation overlay"
		onclick={() => closeMobileMenu()}
		in:fade={{ duration: reducedMotion ? 0 : 180 }}
		out:fade={{ duration: reducedMotion ? 0 : 130 }}
	></button>

	<div
		id="mobile-menubar-panel"
		role="dialog"
		aria-modal="true"
		aria-label="Mobile navigation"
		tabindex="-1"
		class="fixed top-16 left-1/2 z-50 grid w-[min(92vw,30rem)] -translate-x-1/2 gap-2 rounded-lg border border-border bg-white p-3 sm:hidden"
		onkeydown={handleMobilePanelKeydown}
		bind:this={mobilePanel}
		in:fly={{
			y: reducedMotion ? 0 : -12,
			duration: reducedMotion ? 0 : 240,
			easing: cubicOut
		}}
		out:fly={{
			y: reducedMotion ? 0 : -8,
			duration: reducedMotion ? 0 : 170,
			easing: cubicOut
		}}
	>
		<Button
			href="#home"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start px-3 py-2"
		>
			<span>Home</span>
		</Button>
		<Button
			href="#features"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start px-3 py-2"
		>
			<span>Features</span>
		</Button>
		<Button
			href="#how-it-works"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start px-3 py-2"
		>
			<span>Pipeline</span>
		</Button>

		<div class="mt-1 grid grid-cols-1 gap-2">
			<Button
				variant="default"
				href={resolve(docsRoute as '/')}
				onclick={handleMenuLinkSelect}
				class="justify-center"
			>
				<Book size={16} />
				<span>Docs</span>
			</Button>

			<Button
				href="https://github.com/motion-core/motion-gpu"
				target="_blank"
				rel="noreferrer"
				onclick={handleMenuLinkSelect}
				variant="secondary"
				class="col-span-2 justify-center"
			>
				<LogoGithub size={16} />
				<span>GitHub</span>
			</Button>
		</div>
	</div>
{/if}
