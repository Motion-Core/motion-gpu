<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import Menu from 'carbon-icons-svelte/lib/Menu.svelte';
	import Button from '../ui/Button.svelte';

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

<nav
	aria-label="Primary navigation"
	class="fixed top-3 left-1/2 z-60 w-full -translate-x-1/2 px-4 sm:px-8"
>
	<div class="bg-background-muted/70 backdrop-blur-xl">
		<div class="relative flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
			<a
				href={resolve(homeRoute)}
				class="inline-flex items-center gap-2 px-2 py-2 text-sm tracking-tight text-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
			>
				<span class="font-normal">MotionGPU</span>
			</a>

			<div
				class="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 sm:flex"
			>
				<a
					href="#home"
					class="inline-flex items-center gap-2 px-2 py-2 font-fono text-sm tracking-tight text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>
					Home
				</a>
				<a
					href="#about"
					class="inline-flex items-center gap-2 px-2 py-2 font-fono text-sm tracking-tight text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>
					About
				</a>
				<a
					href="#features"
					class="inline-flex items-center gap-2 px-2 py-2 font-fono text-sm tracking-tight text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>
					Features
				</a>
				<a
					href="#how-it-works"
					class="inline-flex items-center gap-2 px-2 py-2 font-fono text-sm tracking-tight text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>
					Pipeline
				</a>
			</div>

			<div class="hidden items-center gap-2 sm:flex">
				<Button href={resolve(docsRoute as '/')} size="sm">Docs</Button>
				<Button
					href="https://github.com/motion-core/motion-gpu"
					target="_blank"
					rel="noreferrer"
					variant="outline"
					size="sm"
				>
					GitHub
				</Button>
			</div>

			<button
				type="button"
				class="inline-flex size-10 items-center justify-center gap-2 font-fono text-sm whitespace-nowrap text-foreground transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:hidden"
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
		class="fixed inset-0 z-40 bg-white/15 backdrop-blur-[2px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:hidden"
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
		class="fixed top-20 left-1/2 z-50 grid w-[min(92vw,30rem)] -translate-x-1/2 gap-2 bg-background-muted/70 p-3 backdrop-blur-xl sm:hidden"
		onkeydown={handleMobilePanelKeydown}
		bind:this={mobilePanel}
		in:fly={{ y: reducedMotion ? 0 : -12, duration: reducedMotion ? 0 : 240, easing: cubicOut }}
		out:fly={{ y: reducedMotion ? 0 : -8, duration: reducedMotion ? 0 : 170, easing: cubicOut }}
	>
		<Button
			href="#home"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start rounded-xl px-3 py-2"
		>
			Home
		</Button>
		<Button
			href="#about"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start rounded-xl px-3 py-2"
		>
			About
		</Button>
		<Button
			href="#features"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start rounded-xl px-3 py-2"
		>
			Features
		</Button>
		<Button
			href="#how-it-works"
			onclick={handleMenuLinkSelect}
			variant="ghost"
			size="none"
			class="justify-start rounded-xl px-3 py-2"
		>
			Pipeline
		</Button>

		<div class="mt-1 grid grid-cols-2 gap-2">
			<Button
				href={resolve(docsRoute as '/')}
				onclick={handleMenuLinkSelect}
				class="justify-center"
			>
				Docs
			</Button>
			<Button
				href="https://github.com/motion-core/motion-gpu"
				target="_blank"
				rel="noreferrer"
				onclick={handleMenuLinkSelect}
				variant="outline"
				class="justify-center"
			>
				GitHub
			</Button>
		</div>
	</div>
{/if}
