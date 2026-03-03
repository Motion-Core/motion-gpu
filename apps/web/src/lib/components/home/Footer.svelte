<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';

	const menu = [
		{ label: 'Home', route: '/' },
		{ label: 'Docs', route: '/docs' },
		{ label: 'Playground', route: '/playground' }
	] as const;
	const isPlaygroundRoute = (route: (typeof menu)[number]['route']) => route === '/playground';

	const follow = [
		{ label: 'GitHub', href: 'https://github.com/motion-core/motion-gpu' },
		{
			label: 'npm',
			href: 'https://www.npmjs.com/package/@motion-core/motion-gpu'
		}
	] as const;
</script>

<footer class="w-full">
	<div class="w-full border-b border-border p-4 sm:p-8">
		<div class="flex w-full items-center justify-start gap-3">
			<div class="inline-flex items-center gap-1 px-2 py-2">
				<span
					class="inline-flex shrink-0 items-center text-accent [&>svg]:size-6 [&>svg]:fill-current"
					aria-hidden="true"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html Logo}
				</span>
				<p class="text-xl tracking-tight">MotionGPU</p>
			</div>
		</div>
	</div>

	<div class="w-full border-b border-border px-4 py-8 sm:grid sm:grid-cols-4 sm:gap-6 sm:px-8">
		<div class="flex flex-col gap-2">
			<h3 class="text-xs tracking-wide uppercase">Menu</h3>
			<ul class="grid gap-1 tracking-tight">
				{#each menu as item (item.label)}
					<li>
						<a
							href={resolve(item.route as '/')}
							data-sveltekit-reload={isPlaygroundRoute(item.route) ? '' : undefined}
							data-sveltekit-preload-data={isPlaygroundRoute(item.route) ? 'off' : undefined}
							data-sveltekit-preload-code={isPlaygroundRoute(item.route) ? 'off' : undefined}
							class="w-fit text-sm text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-6 flex flex-col gap-2 sm:mt-0">
			<h3 class="text-xs tracking-wide uppercase">Follow</h3>
			<ul class="grid gap-1 tracking-tight">
				{#each follow as item (item.label)}
					<li>
						<a
							href={item.href}
							target="_blank"
							rel="external noreferrer"
							class="w-fit text-sm text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-6 flex flex-col gap-2 sm:mt-0">
			<h3 class="text-xs tracking-wide uppercase">Contact</h3>
			<a
				href="https://github.com/motion-core/motion-gpu/issues"
				target="_blank"
				rel="noreferrer"
				class="w-fit text-sm text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
				>Issues</a
			>
			<a
				href="https://github.com/motion-core/motion-gpu/discussions"
				target="_blank"
				rel="noreferrer"
				class="w-fit text-sm text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
				>Discussions</a
			>
		</div>

		<div class="mt-6 flex flex-col gap-2 sm:mt-0">
			<h3 class="text-xs tracking-wide uppercase">Project</h3>
			<a
				href="https://github.com/motion-core/motion-gpu/blob/main/LICENSE"
				target="_blank"
				rel="noreferrer"
				class="w-fit text-sm text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
				>&#8627; License</a
			>
		</div>
	</div>
</footer>
