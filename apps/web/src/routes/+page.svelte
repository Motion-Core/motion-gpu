<script lang="ts">
	import Features from '$lib/components/home/Features.svelte';
	import CTA from '$lib/components/home/CTA.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
	import Hero from '$lib/components/home/Hero.svelte';
	import HowItWorks from '$lib/components/home/HowItWorks.svelte';
	import Preview from '$lib/components/home/Preview.svelte';
	import Menubar from '$lib/components/home/Menubar.svelte';
</script>

<a
	href="#main-content"
	class="sr-only fixed top-3 left-3 z-100 bg-foreground px-4 py-2 text-sm text-background-inset focus:not-sr-only focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background-inset focus-visible:outline-none"
>
	Skip to main content
</a>

<Menubar />
<main
	id="main-content"
	tabindex="-1"
	class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center border-x border-border bg-background"
>
	<Hero />
	<Preview />
	<Features />
	<HowItWorks />
	<CTA />
	<div class="w-full border-t border-border">
		<div class="mx-auto w-full max-w-5xl border-x border-border">
			<Footer />
		</div>
	</div>
</main>
