<script lang="ts">
	import About from '$lib/components/(home)/About.svelte';
	import Cta from '$lib/components/(home)/Cta.svelte';
	import Features from '$lib/components/(home)/Features.svelte';
	import Hero from '$lib/components/(home)/Hero.svelte';
</script>

<main
	class="flex min-h-dvh w-screen flex-col items-center justify-center gap-12 p-4 sm:gap-24 sm:p-8"
>
	<Hero />
	<About />
	<Features />
	<Cta />
</main>
