<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { cn } from '$lib/utils/cn';
	import CopyCodeButton from './markdown/CopyCodeButton.svelte';
	import Pre from './markdown/Pre.svelte';
	import { getHighlighter } from '$lib/utils/highlighter';
	import {
		packageManagers,
		packageManagerStore,
		type PackageManager
	} from '$lib/stores/package-manager.svelte';
	import { siteConfig } from '$lib/config/site';

	type Props = {
		pkg?: string;
		args?: string;
		isDev?: boolean;
	};

	let { pkg = siteConfig.package.name, args, isDev = false }: Props = $props();
	let tabList = $state<HTMLDivElement | null>(null);
	let activeIndicatorLeft = $state(0);
	let activeIndicatorWidth = $state(0);
	let pendingIndicatorFrame: number | null = null;

	const tabRefs = new SvelteMap<PackageManager, HTMLButtonElement>();

	const commands: Record<PackageManager, string> = $derived(
		isDev
			? {
					npm: `npm install -D ${pkg} ${args ?? ''}`,
					pnpm: `pnpm add -D ${pkg} ${args ?? ''}`,
					bun: `bun add -D ${pkg} ${args ?? ''}`,
					yarn: `yarn add -D ${pkg} ${args ?? ''}`
				}
			: {
					npm: `npm install ${pkg} ${args ?? ''}`,
					pnpm: `pnpm add ${pkg} ${args ?? ''}`,
					bun: `bun add ${pkg} ${args ?? ''}`,
					yarn: `yarn add ${pkg} ${args ?? ''}`
				}
	);

	const activeCommand = $derived(commands[packageManagerStore.active]);

	function registerTab(node: HTMLElement, pm: PackageManager) {
		tabRefs.set(pm, node as HTMLButtonElement);

		return {
			update(nextPm: PackageManager) {
				if (nextPm === pm) return;
				tabRefs.delete(pm);
				pm = nextPm;
				tabRefs.set(pm, node as HTMLButtonElement);
			},
			destroy() {
				tabRefs.delete(pm);
			}
		};
	}

	function updateActiveIndicator() {
		const activeTab = tabRefs.get(packageManagerStore.active);

		if (!tabList || !activeTab) {
			activeIndicatorLeft = 0;
			activeIndicatorWidth = 0;
			return;
		}

		activeIndicatorLeft = activeTab.offsetLeft;
		activeIndicatorWidth = activeTab.offsetWidth;
	}

	function scheduleActiveIndicatorUpdate() {
		if (typeof window === 'undefined') {
			updateActiveIndicator();
			return;
		}

		if (pendingIndicatorFrame !== null) {
			window.cancelAnimationFrame(pendingIndicatorFrame);
		}

		pendingIndicatorFrame = window.requestAnimationFrame(() => {
			pendingIndicatorFrame = null;
			updateActiveIndicator();
			document.documentElement.dataset.motiongpuPackageManagerReady = 'true';
		});
	}

	$effect(() => {
		const activePackageManager = packageManagerStore.active;
		const currentTabList = tabList;
		void activePackageManager;
		void currentTabList;

		scheduleActiveIndicatorUpdate();

		if (typeof window === 'undefined') return;

		window.addEventListener('resize', scheduleActiveIndicatorUpdate);

		return () => {
			window.removeEventListener('resize', scheduleActiveIndicatorUpdate);
			if (pendingIndicatorFrame !== null) {
				window.cancelAnimationFrame(pendingIndicatorFrame);
				pendingIndicatorFrame = null;
			}
		};
	});

	const highlightedCommands = $derived.by(() => {
		const highlighter = getHighlighter();
		const highlighted = {} as Record<PackageManager, { light: string; dark: string }>;

		for (const pm of packageManagers) {
			const cmd = commands[pm];
			highlighted[pm] = {
				light: highlighter.codeToHtml(cmd, {
					lang: 'bash',
					theme: 'github-light'
				}),
				dark: highlighter.codeToHtml(cmd, {
					lang: 'bash',
					theme: 'github-dark'
				})
			};
		}

		return highlighted;
	});
</script>

<div class="inset-shadow my-6 rounded-lg bg-background-inset p-1.5">
	<div class="relative w-full rounded-md bg-background card">
		<div
			class="relative flex items-center justify-between rounded-t-md after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:shadow-2xs after:shadow-white after:content-[''] dark:after:bg-background-inset dark:after:shadow-border"
		>
			<div class="relative flex items-center" bind:this={tabList}>
				{#if activeIndicatorWidth > 0}
					<div
						class="tab-active-line package-manager-active-line pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 transition-[transform,width] duration-150 ease-out"
						style={`
								width: ${activeIndicatorWidth}px;
								transform: translateX(${activeIndicatorLeft}px);
							`}
					></div>
				{/if}

				{#each packageManagers as pm (pm)}
					<button
						onclick={() => (packageManagerStore.active = pm)}
						class={cn(
							'package-manager-tab relative z-20 px-4 py-2.5 text-sm font-medium tracking-normal transition-colors duration-150 ease-out outline-none select-none',
							packageManagerStore.active === pm
								? 'text-accent'
								: 'text-foreground-muted hover:text-foreground'
						)}
						data-package-manager={pm}
						use:registerTab={pm}
					>
						{pm}
					</button>
				{/each}
			</div>

			<CopyCodeButton code={activeCommand} class="mr-2" />
		</div>

		<div
			class="min-h-12.5 p-4 [&>div]:mt-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:shadow-none [&>div]:[box-shadow:none]!"
		>
			<Pre code="" unstyled={true}>
				{#each packageManagers as pm (pm)}
					<div
						class="package-manager-command"
						data-package-manager={pm}
						data-active={packageManagerStore.active === pm}
					>
						<div class="shiki-theme-light">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html highlightedCommands[pm].light}
						</div>
						<div class="shiki-theme-dark">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html highlightedCommands[pm].dark}
						</div>
					</div>
				{/each}
			</Pre>
		</div>
	</div>

	<style>
		.tab-active-line {
			background-image: linear-gradient(
				to right,
				transparent,
				oklch(from var(--color-accent) l c h / 0.68) 18%,
				var(--color-accent) 50%,
				oklch(from var(--color-accent) l c h / 0.68) 82%,
				transparent
			);
			filter: drop-shadow(0 0 6px oklch(from var(--color-accent) l c h / 0.38));
		}

		.package-manager-tab::after {
			position: absolute;
			right: 0;
			bottom: 0;
			left: 0;
			height: 2px;
			pointer-events: none;
			content: '';
			background-image: linear-gradient(
				to right,
				transparent,
				oklch(from var(--color-accent) l c h / 0.68) 18%,
				var(--color-accent) 50%,
				oklch(from var(--color-accent) l c h / 0.68) 82%,
				transparent
			);
			filter: drop-shadow(0 0 6px oklch(from var(--color-accent) l c h / 0.38));
			opacity: 0;
		}

		:global(html[data-motiongpu-package-manager]:not([data-motiongpu-package-manager-ready]))
			.package-manager-active-line {
			opacity: 0;
		}

		.package-manager-command {
			display: none;
		}

		.package-manager-command[data-active='true'] {
			display: block;
		}

		:global(html[data-motiongpu-package-manager]:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab {
			color: var(--color-foreground-muted);
		}

		:global(html[data-motiongpu-package-manager='npm']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='npm'],
		:global(html[data-motiongpu-package-manager='pnpm']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='pnpm'],
		:global(html[data-motiongpu-package-manager='bun']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='bun'],
		:global(html[data-motiongpu-package-manager='yarn']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='yarn'] {
			color: var(--color-accent);
		}

		:global(html[data-motiongpu-package-manager='npm']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='npm']::after,
		:global(html[data-motiongpu-package-manager='pnpm']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='pnpm']::after,
		:global(html[data-motiongpu-package-manager='bun']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='bun']::after,
		:global(html[data-motiongpu-package-manager='yarn']:not([data-motiongpu-package-manager-ready]))
			.package-manager-tab[data-package-manager='yarn']::after {
			opacity: 1;
		}

		:global(html[data-motiongpu-package-manager='npm'])
			.package-manager-command[data-package-manager='npm'],
		:global(html[data-motiongpu-package-manager='pnpm'])
			.package-manager-command[data-package-manager='pnpm'],
		:global(html[data-motiongpu-package-manager='bun'])
			.package-manager-command[data-package-manager='bun'],
		:global(html[data-motiongpu-package-manager='yarn'])
			.package-manager-command[data-package-manager='yarn'] {
			display: block;
		}

		:global(html[data-motiongpu-package-manager='pnpm'])
			.package-manager-command[data-active='true']:not([data-package-manager='pnpm']),
		:global(html[data-motiongpu-package-manager='bun'])
			.package-manager-command[data-active='true']:not([data-package-manager='bun']),
		:global(html[data-motiongpu-package-manager='yarn'])
			.package-manager-command[data-active='true']:not([data-package-manager='yarn']) {
			display: none;
		}

		.shiki-theme-dark {
			display: none;
		}

		:global(.dark) :global(.shiki-theme-light) {
			display: none;
		}

		:global(.dark) :global(.shiki-theme-dark) {
			display: block;
		}
	</style>
</div>
