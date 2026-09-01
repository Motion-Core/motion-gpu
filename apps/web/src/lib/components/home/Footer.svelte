<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/assets/spektral-logo.svg?raw';

	const menu = [
		{ label: 'Home', route: '/' },
		{ label: 'Docs', route: '/docs' },
		{ label: 'Playground', route: '/playground' }
	] as const;
	const isPlaygroundRoute = (route: (typeof menu)[number]['route']) => route === '/playground';

	const follow = [
		{ label: 'GitHub', href: 'https://github.com/kaltwrk/spektral' },
		{
			label: 'npm',
			href: 'https://www.npmjs.com/package/spektral'
		}
	] as const;

	const footerLinkClass =
		'focus-ring focus-outline w-fit rounded-xs text-sm font-normal text-foreground-muted transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground motion-reduce:transition-none';
</script>

<footer data-reveal-section class="w-full">
	<div class="w-full border-b border-(--guide-ink) p-4 sm:p-8">
		<div class="flex w-full items-center justify-start gap-3">
			<div class="inline-flex items-center gap-2 px-2 py-2">
				<span
					class="inline-flex shrink-0 items-center text-accent [&>svg]:size-6 [&>svg]:fill-current"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html Logo}
				</span>
				<p class="pt-0.5 text-xl font-medium tracking-tight text-foreground">Spektral</p>
			</div>
		</div>
	</div>

	<div
		class="w-full border-b border-(--guide-ink) px-4 py-8 sm:grid sm:grid-cols-4 sm:gap-6 sm:px-8"
	>
		<div class="flex flex-col gap-2">
			<h3 class="text-xs font-medium tracking-wide text-foreground uppercase">Menu</h3>
			<ul class="grid gap-1 tracking-tight">
				{#each menu as item (item.label)}
					<li>
						<a
							href={resolve(item.route as '/')}
							data-sveltekit-reload={isPlaygroundRoute(item.route) ? '' : undefined}
							data-sveltekit-preload-data={isPlaygroundRoute(item.route) ? 'off' : undefined}
							data-sveltekit-preload-code={isPlaygroundRoute(item.route) ? 'off' : undefined}
							class={footerLinkClass}>&#8627; {item.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-6 flex flex-col gap-2 sm:mt-0">
			<h3 class="text-xs font-medium tracking-wide text-foreground uppercase">Follow</h3>
			<ul class="grid gap-1 tracking-tight">
				{#each follow as item (item.label)}
					<li>
						<a href={item.href} target="_blank" rel="external noreferrer" class={footerLinkClass}
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-6 flex flex-col gap-2 sm:mt-0">
			<h3 class="text-xs font-medium tracking-wide text-foreground uppercase">Contact</h3>
			<a
				href="https://github.com/kaltwrk/spektral/issues"
				target="_blank"
				rel="noreferrer"
				class={footerLinkClass}>Issues</a
			>
			<a
				href="https://github.com/kaltwrk/spektral/discussions"
				target="_blank"
				rel="noreferrer"
				class={footerLinkClass}>Discussions</a
			>
		</div>

		<div class="mt-6 flex flex-col gap-2 sm:mt-0">
			<h3 class="text-xs font-medium tracking-wide text-foreground uppercase">Project</h3>
			<a
				href="https://github.com/kaltwrk/spektral/blob/master/LICENSE"
				target="_blank"
				rel="noreferrer"
				class={footerLinkClass}>&#8627; License</a
			>
		</div>
	</div>
</footer>
