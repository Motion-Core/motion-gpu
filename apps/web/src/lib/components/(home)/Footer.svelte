<script lang="ts">
	import { resolve } from '$app/paths';

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
	<div class="w-full border-y border-background-muted/90 px-2 py-6 sm:px-6 sm:py-8">
		<div class="flex w-full items-center justify-start gap-6">
			<p class="text-xl tracking-tight">MotionGPU</p>
			<p class="font-fono text-sm text-foreground-muted">Svelte-first WebGPU Runtime</p>
		</div>
	</div>

	<div
		class="w-full border-b border-background-muted/90 px-2 py-6 sm:px-6 sm:py-8 lg:grid lg:grid-cols-4 lg:gap-6"
	>
		<div class="grid gap-2">
			<h3 class="font-fono text-xs tracking-wide uppercase">Menu</h3>
			<ul class="grid gap-1 font-fono tracking-tight">
				{#each menu as item (item.label)}
					<li>
						<a
							href={resolve(item.route as '/')}
							class="text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
				<li>
					<a
						href="#features"
						class="text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
						>&#8627; Features</a
					>
				</li>
			</ul>
		</div>

		<div class="mt-6 grid gap-2 lg:mt-0">
			<h3 class="font-fono text-xs tracking-wide uppercase">Follow</h3>
			<ul class="grid gap-1 font-fono tracking-tight">
				{#each follow as item (item.label)}
					<li>
						<a
							href={item.href}
							target="_blank"
							rel="external noreferrer"
							class="text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
							>&#8627; {item.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-6 grid gap-2 lg:mt-0">
			<h3 class="font-fono text-xs tracking-wide uppercase">Project</h3>
			<p class="font-fono text-sm text-foreground-muted">MIT licensed and open source.</p>
			<a
				href="https://github.com/motion-core/motion-gpu/blob/main/LICENSE"
				target="_blank"
				rel="noreferrer"
				class="w-fit font-fono text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>&#8627; License</a
			>
		</div>

		<div class="mt-6 grid gap-2 lg:mt-0">
			<h3 class="font-fono text-xs tracking-wide uppercase">Contact</h3>
			<a
				href="https://github.com/motion-core/motion-gpu/issues"
				target="_blank"
				rel="noreferrer"
				class="w-fit font-fono text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>Issues</a
			>
			<a
				href="https://github.com/motion-core/motion-gpu/discussions"
				target="_blank"
				rel="noreferrer"
				class="w-fit font-fono text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
				>Discussions</a
			>
		</div>
	</div>

	<p
		class="px-2 pt-6 text-[clamp(4rem,16vw,16rem)] leading-none font-semibold tracking-tight sm:px-6"
	>
		MotionGPU
	</p>
</footer>
