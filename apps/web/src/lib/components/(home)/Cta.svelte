<script lang="ts">
	import { resolve } from '$app/paths';
	import Book from 'carbon-icons-svelte/lib/Book.svelte';
	import LogoGithub from 'carbon-icons-svelte/lib/LogoGithub.svelte';
	import Button from '../ui/Button.svelte';
</script>

<section
	class="flex w-full items-center justify-center bg-foreground px-4 py-14 text-background sm:px-8 sm:py-20"
>
	<div class="grid max-w-3xl place-items-center gap-5 text-center">
		<h2 class="max-w-3xl text-4xl tracking-tight text-balance sm:text-6xl">
			Build sharper visuals with a runtime that stays in control.
		</h2>
		<p class="max-w-xl font-fono text-base text-background opacity-80">
			Start with the docs to learn the API, then explore the repository for examples and internals.
		</p>
		<div class="mt-2 flex flex-wrap justify-center gap-3">
			<Button
				href={resolve('/docs' as '/')}
				variant="secondary"
				class="bg-background text-foreground"
			>
				<Book size={16} />
				<span>Open docs</span>
			</Button>
			<Button
				href="https://github.com/motion-core/motion-gpu"
				target="_blank"
				rel="noreferrer"
				variant="outline"
				class="border-border text-background hover:bg-background/10"
			>
				<LogoGithub size={16} />
				<span>View GitHub</span>
			</Button>
		</div>
	</div>
</section>
