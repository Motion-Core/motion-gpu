<script module lang="ts">
	let installationTabsCounter = 0;
</script>

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
	installationTabsCounter += 1;
	const tabsInstanceId = `installation-tabs-${installationTabsCounter.toString()}`;
	const panelId = `${tabsInstanceId}-panel`;
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
	const activeIndex = $derived(Math.max(0, packageManagers.indexOf(packageManagerStore.active)));
	const activeTabId = $derived(`${tabsInstanceId}-tab-${activeIndex.toString()}`);

	function setActiveTab(index: number) {
		packageManagerStore.active = packageManagers[index];
	}

	function focusTabByIndex(index: number) {
		const tabElement = tabRefs.get(packageManagers[index]);
		tabElement?.focus();
	}

	function handleTabKeydown(event: KeyboardEvent, index: number) {
		const lastIndex = packageManagers.length - 1;
		if (lastIndex < 0) return;
		let nextIndex: number;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault();
				nextIndex = index === lastIndex ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				nextIndex = index === 0 ? lastIndex : index - 1;
				break;
			case 'Home':
				event.preventDefault();
				nextIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				nextIndex = lastIndex;
				break;
			default:
				return;
		}

		setActiveTab(nextIndex);
		focusTabByIndex(nextIndex);
	}

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
			document.documentElement.dataset.docsPackageManagerReady = 'true';
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
					theme: 'github-light',
					tabindex: false
				}),
				dark: highlighter.codeToHtml(cmd, {
					lang: 'bash',
					theme: 'github-dark',
					tabindex: false
				})
			};
		}

		return highlighted;
	});
</script>

<div class="card-outer my-6 rounded-lg bg-background-inset p-1.5">
	<div class="relative w-full rounded-md bg-background card">
		<div
			class="relative flex items-center justify-between rounded-t-md after:absolute after:inset-x-0 after:bottom-0 after:h-px after:guide-duotone after:content-['']"
		>
			<div
				class="relative flex min-w-0 flex-1 items-center overflow-x-auto [&>button:first-of-type]:rounded-tl-md"
				role="tablist"
				aria-label="Package manager"
				bind:this={tabList}
			>
				{#if activeIndicatorWidth > 0}
					<div
						class="tab-active-line package-manager-active-line pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 transition-[transform,width] duration-150 ease-out motion-reduce:transition-none"
						style={`
									width: ${activeIndicatorWidth.toString()}px;
									transform: translateX(${activeIndicatorLeft.toString()}px);
								`}
					></div>
				{/if}

				{#each packageManagers as pm, index (pm)}
					<button
						type="button"
						id={`${tabsInstanceId}-tab-${index.toString()}`}
						role="tab"
						aria-selected={index === activeIndex}
						aria-controls={panelId}
						tabindex={index === activeIndex ? 0 : -1}
						onclick={() => {
							setActiveTab(index);
						}}
						onkeydown={(event) => {
							handleTabKeydown(event, index);
						}}
						class={cn(
							'focus-ring package-manager-tab relative z-20 px-4 py-3 text-sm font-medium tracking-normal transition-[color,box-shadow] duration-150 ease-out outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset motion-reduce:transition-none',
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

			<div class="mr-2 flex w-fit flex-none items-center">
				<CopyCodeButton code={activeCommand} />
			</div>
		</div>

		<div
			id={panelId}
			role="tabpanel"
			aria-labelledby={activeTabId}
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

		:global(html[data-docs-package-manager]:not([data-docs-package-manager-ready]))
			.package-manager-active-line {
			opacity: 0;
		}

		.package-manager-command {
			display: none;
		}

		.package-manager-command[data-active='true'] {
			display: block;
		}

		:global(html[data-docs-package-manager]:not([data-docs-package-manager-ready]))
			.package-manager-tab {
			color: var(--color-foreground-muted);
		}

		:global(html[data-docs-package-manager='npm']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='npm'],
		:global(html[data-docs-package-manager='pnpm']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='pnpm'],
		:global(html[data-docs-package-manager='bun']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='bun'],
		:global(html[data-docs-package-manager='yarn']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='yarn'] {
			color: var(--color-accent);
		}

		:global(html[data-docs-package-manager='npm']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='npm']::after,
		:global(html[data-docs-package-manager='pnpm']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='pnpm']::after,
		:global(html[data-docs-package-manager='bun']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='bun']::after,
		:global(html[data-docs-package-manager='yarn']:not([data-docs-package-manager-ready]))
			.package-manager-tab[data-package-manager='yarn']::after {
			opacity: 1;
		}

		:global(html[data-docs-package-manager='npm'])
			.package-manager-command[data-package-manager='npm'],
		:global(html[data-docs-package-manager='pnpm'])
			.package-manager-command[data-package-manager='pnpm'],
		:global(html[data-docs-package-manager='bun'])
			.package-manager-command[data-package-manager='bun'],
		:global(html[data-docs-package-manager='yarn'])
			.package-manager-command[data-package-manager='yarn'] {
			display: block;
		}

		:global(html[data-docs-package-manager='pnpm'])
			.package-manager-command[data-active='true']:not([data-package-manager='pnpm']),
		:global(html[data-docs-package-manager='bun'])
			.package-manager-command[data-active='true']:not([data-package-manager='bun']),
		:global(html[data-docs-package-manager='yarn'])
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
