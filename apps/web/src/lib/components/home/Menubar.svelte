<script lang="ts">
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { AppCloseIcon, AppGitHubIcon, AppMenuIcon } from '$lib/components/icons';
	import Button from '../ui/Button.svelte';
	import ThemeToggle from '../ui/ThemeToggle.svelte';
	import { brandingConfig } from '$lib/config/branding';

	const homeRoute = '/' as const;
	const focusableSelectors = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
	const navigationLinkClass =
		'focus-ring focus-outline inline-flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-normal tracking-tight text-foreground-muted transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground motion-reduce:transition-none';

	let mobileOpen = $state(false);
	let restoreFocusOnClose = true;
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
	<div
		class="mx-auto max-w-6xl border-(--guide-ink) bg-background shadow-md sm:border-x sm:border-b sm:shadow-none"
	>
		<div class="relative flex items-center justify-between gap-3 px-4 py-1.5">
			<a
				href={resolve(homeRoute)}
				class="focus-ring focus-outline inline-flex items-center gap-1.5 rounded-sm py-2 text-sm tracking-tight text-foreground transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground motion-reduce:transition-none"
			>
				<span
					class="inline-flex shrink-0 items-center text-accent [&>svg]:size-5 [&>svg]:fill-current"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html brandingConfig.logoRaw}
				</span>
				<span class="text-base font-medium tracking-tight text-foreground"
					>{brandingConfig.name}</span
				>
			</a>

			<div
				class="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 sm:flex"
			>
				<a href="#home" class={navigationLinkClass}> Home </a>
				<a href="#features" class={navigationLinkClass}> Features </a>
				<a href="#how-it-works" class={navigationLinkClass}> Pipeline </a>
				<a href="#faq" class={navigationLinkClass}> FAQ </a>
			</div>

			<div class="hidden items-center gap-2 sm:flex">
				<ThemeToggle tooltipSide="bottom" />
				<Button
					href="https://github.com/kaltwrk/spektral"
					target="_blank"
					rel="noreferrer"
					variant="secondary"
					size="md"
				>
					<AppGitHubIcon size={16} />
					<span>GitHub</span>
				</Button>
			</div>

			<button
				type="button"
				class="focus-ring focus-outline -mr-2 inline-flex size-10 items-center justify-center gap-2 rounded-sm text-sm whitespace-nowrap text-foreground transition-[background-color,box-shadow] duration-150 ease-out outline-none hover:bg-background-inset motion-reduce:transition-none sm:hidden"
				aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
				aria-expanded={mobileOpen}
				aria-controls="mobile-menubar-panel"
				aria-haspopup="dialog"
				onclick={toggleMobileMenu}
			>
				{#if mobileOpen}
					<AppCloseIcon size={18} />
				{:else}
					<AppMenuIcon size={18} />
				{/if}
			</button>
		</div>
	</div>
</nav>

<div
	class="mobile-overlay fixed inset-0 z-40 bg-background-inset/80 backdrop-blur-sm sm:hidden"
	class:active={mobileOpen}
	aria-label="Close mobile navigation overlay"
	onclick={() => {
		closeMobileMenu();
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMobileMenu();
		}
	}}
	role="button"
	tabindex="-1"
	aria-hidden={!mobileOpen}
></div>

<div
	id="mobile-menubar-panel"
	role="dialog"
	aria-modal="true"
	aria-label="Mobile navigation"
	tabindex="-1"
	class="mobile-panel fixed top-16 left-1/2 z-50 grid w-[min(92vw,30rem)] gap-2 rounded-lg bg-background p-3 card sm:hidden"
	class:active={mobileOpen}
	onkeydown={handleMobilePanelKeydown}
	bind:this={mobilePanel}
	aria-hidden={!mobileOpen}
>
	<Button
		href="#home"
		onclick={handleMenuLinkSelect}
		variant="ghost"
		size="none"
		class="justify-start px-3 py-2 text-base"
	>
		<span>Home</span>
	</Button>
	<Button
		href="#features"
		onclick={handleMenuLinkSelect}
		variant="ghost"
		size="none"
		class="justify-start px-3 py-2 text-base"
	>
		<span>Features</span>
	</Button>
	<Button
		href="#how-it-works"
		onclick={handleMenuLinkSelect}
		variant="ghost"
		size="none"
		class="justify-start px-3 py-2 text-base"
	>
		<span>Pipeline</span>
	</Button>
	<Button
		href="#faq"
		onclick={handleMenuLinkSelect}
		variant="ghost"
		size="none"
		class="justify-start px-3 py-2 text-base"
	>
		<span>FAQ</span>
	</Button>

	<div class="mt-1 grid grid-cols-1 gap-2">
		<Button
			href="https://github.com/kaltwrk/spektral"
			target="_blank"
			rel="noreferrer"
			onclick={handleMenuLinkSelect}
			variant="secondary"
			class="col-span-2 justify-center"
		>
			<AppGitHubIcon size={16} />
			<span>GitHub</span>
		</Button>
		<ThemeToggle class="col-span-2 ml-auto size-8 sm:hidden" tooltipSide="bottom" />
	</div>
</div>

<style>
	.mobile-overlay {
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms ease-out;
		will-change: opacity;
	}

	.mobile-overlay.active {
		opacity: 1;
		pointer-events: auto;
	}

	.mobile-panel {
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 200ms ease-out,
			transform 200ms ease-out;
		transform: translate(-50%, -12px);
		will-change: opacity, transform;
	}

	.mobile-panel.active {
		opacity: 1;
		pointer-events: auto;
		transform: translate(-50%, 0);
	}

	@media (prefers-reduced-motion: reduce) {
		.mobile-overlay,
		.mobile-panel {
			transition: none;
		}

		.mobile-panel {
			transform: translate(-50%, 0);
		}
	}
</style>
