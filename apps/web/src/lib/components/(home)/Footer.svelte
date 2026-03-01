<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/assets/motiongpu-logo.svg?raw';

	const menu = [
		{ label: 'Home', route: '/' },
		{ label: 'Docs', route: '/docs' }
	] as const;

	const follow = [
		{ label: 'GitHub', href: 'https://github.com/motion-core/motion-gpu' },
		{ label: 'npm', href: 'https://www.npmjs.com/package/@motion-core/motion-gpu' }
	] as const;
</script>

<footer class="w-full">
	<div class="w-full border-y border-border px-2 py-6 sm:px-6 sm:py-8">
		<div class="flex w-full items-center justify-start gap-6">
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
			<p class="text-base text-foreground-muted">Svelte-first WebGPU Runtime</p>
		</div>
	</div>

	<div
		class="w-full border-b border-border px-2 py-6 sm:px-6 sm:py-8 lg:grid lg:grid-cols-4 lg:gap-6"
	>
		<div class="grid gap-2">
			<h3 class="font-mono text-xs tracking-wide uppercase">Menu</h3>
			<ul class="grid gap-1 tracking-tight">
				{#each menu as item (item.label)}
					<li>
						<a
							href={resolve(item.route as '/')}
							class="text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
				<li>
					<a
						href="#features"
						class="text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
						>&#8627; Features</a
					>
				</li>
			</ul>
		</div>

		<div class="mt-6 grid gap-2 lg:mt-0">
			<h3 class="font-mono text-xs tracking-wide uppercase">Follow</h3>
			<ul class="grid gap-1 tracking-tight">
				{#each follow as item (item.label)}
					<li>
						<a
							href={item.href}
							target="_blank"
							rel="external noreferrer"
							class="text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-6 grid gap-2 lg:mt-0">
			<h3 class="font-mono text-xs tracking-wide uppercase">Project</h3>
			<p class="text-sm text-foreground-muted">MIT licensed and open source.</p>
			<a
				href="https://github.com/motion-core/motion-gpu/blob/main/LICENSE"
				target="_blank"
				rel="noreferrer"
				class="w-fit text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>&#8627; License</a
			>
		</div>

		<div class="mt-6 grid gap-2 lg:mt-0">
			<h3 class="font-mono text-xs tracking-wide uppercase">Contact</h3>
			<a
				href="https://github.com/motion-core/motion-gpu/issues"
				target="_blank"
				rel="noreferrer"
				class="w-fit text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>Issues</a
			>
			<a
				href="https://github.com/motion-core/motion-gpu/discussions"
				target="_blank"
				rel="noreferrer"
				class="w-fit text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>Discussions</a
			>
		</div>
	</div>
</footer>
