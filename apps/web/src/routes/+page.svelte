<script lang="ts">
	import { onMount } from 'svelte';
	import Features from '$lib/components/home/Features.svelte';
	import CTA from '$lib/components/home/CTA.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
	import Hero from '$lib/components/home/Hero.svelte';
	import HowItWorks from '$lib/components/home/HowItWorks.svelte';
	import FAQ from '$lib/components/home/FAQ.svelte';
	import Preview from '$lib/components/home/Preview.svelte';
	import Menubar from '$lib/components/home/Menubar.svelte';

	let mainContent = $state<HTMLElement | null>(null);
	let landingAnimationState = $state<'preparing' | 'ready'>('preparing');

	onMount(() => {
		let destroyAnimations: () => void = () => undefined;
		let isActive = true;

		const setupAnimations = async () => {
			if (!mainContent) {
				landingAnimationState = 'ready';
				return;
			}

			try {
				const { createLandingScrollAnimations } = await import('$lib/animations/landing');
				if (!isActive) return;
				destroyAnimations = createLandingScrollAnimations(mainContent);
			} finally {
				if (isActive) {
					landingAnimationState = 'ready';
				}
			}
		};

		void setupAnimations();

		return () => {
			isActive = false;
			destroyAnimations();
		};
	});
</script>

<a
	href="#main-content"
	class="focus-ring focus-outline sr-only fixed top-3 left-3 z-100 rounded-sm bg-foreground px-4 py-2 text-sm text-background-inset outline-none focus:not-sr-only"
>
	Skip to main content
</a>

<Menubar />
<main
	id="main-content"
	bind:this={mainContent}
	tabindex="-1"
	data-landing-anim-root
	data-landing-anim-state={landingAnimationState}
	class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center border-(--guide-ink) bg-background sm:border-x"
>
	<Hero />
	<Preview />
	<Features />
	<HowItWorks />
	<FAQ />
	<CTA />
	<div class="w-full border-t border-(--guide-ink) bg-guide-dashed">
		<div class="mx-auto w-full max-w-5xl border-x border-(--guide-ink) bg-background">
			<Footer />
		</div>
	</div>
</main>
