<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import {
		AppFrameworkReactIcon,
		AppFrameworkSvelteIcon,
		AppFrameworkVueIcon
	} from '$lib/components/icons';
	import { cn } from '$lib/utils/cn';
	import CopyCodeButton from './markdown/CopyCodeButton.svelte';
	import Pre from './markdown/Pre.svelte';
	import { getHighlighter } from '$lib/utils/highlighter';
	import { frameworkStore, frameworks, type Framework } from '$lib/stores/framework.svelte';

	type Props = {
		svelteCode: string;
		reactCode: string;
		vueCode: string;
		svelteLang?: string;
		reactLang?: string;
		vueLang?: string;
	};

	let {
		svelteCode,
		reactCode,
		vueCode,
		svelteLang = 'svelte',
		reactLang = 'tsx',
		vueLang = 'vue'
	}: Props = $props();

	let tabList = $state<HTMLDivElement | null>(null);
	let activeIndicatorLeft = $state(0);
	let activeIndicatorWidth = $state(0);
	let pendingIndicatorFrame: number | null = null;

	const tabRefs = new SvelteMap<Framework, HTMLButtonElement>();

	const codeMap: Record<Framework, string> = $derived({
		svelte: svelteCode,
		react: reactCode,
		vue: vueCode
	});
	const activeCode = $derived(codeMap[frameworkStore.active]);

	function registerTab(node: HTMLElement, fw: Framework) {
		tabRefs.set(fw, node as HTMLButtonElement);

		return {
			update(nextFw: Framework) {
				if (nextFw === fw) return;
				tabRefs.delete(fw);
				fw = nextFw;
				tabRefs.set(fw, node as HTMLButtonElement);
			},
			destroy() {
				tabRefs.delete(fw);
			}
		};
	}

	function updateActiveIndicator() {
		const activeTab = tabRefs.get(frameworkStore.active);

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
			document.documentElement.dataset.motiongpuFrameworkReady = 'true';
		});
	}

	const highlighted = $derived.by(() => {
		const toHighlight: Record<Framework, { code: string; lang: string }> = {
			svelte: { code: svelteCode, lang: svelteLang },
			react: { code: reactCode, lang: reactLang },
			vue: { code: vueCode, lang: vueLang }
		};
		const highlighter = getHighlighter();
		const highlightedCode = {} as Record<Framework, { light: string; dark: string }>;

		for (const fw of frameworks) {
			const { code, lang } = toHighlight[fw];
			highlightedCode[fw] = {
				light: highlighter.codeToHtml(code, { lang, theme: 'github-light' }),
				dark: highlighter.codeToHtml(code, { lang, theme: 'github-dark' })
			};
		}

		return highlightedCode;
	});

	$effect(() => {
		const activeFramework = frameworkStore.active;
		const currentTabList = tabList;
		void activeFramework;
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
</script>

<div class="inset-shadow my-6 rounded-lg bg-background-inset p-1.5">
	<div class="relative w-full rounded-md bg-background card">
		<div
			class="relative flex items-center justify-between rounded-t-md after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:shadow-2xs after:shadow-white after:content-[''] dark:after:bg-background-inset dark:after:shadow-border"
		>
			<div class="relative flex items-center" bind:this={tabList}>
				{#if activeIndicatorWidth > 0}
					<div
						class="tab-active-line framework-active-line pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 transition-[transform,width] duration-150 ease-out"
						style={`
								width: ${activeIndicatorWidth}px;
								transform: translateX(${activeIndicatorLeft}px);
							`}
					></div>
				{/if}

				{#each frameworks as fw (fw)}
					<button
						onclick={() => (frameworkStore.active = fw)}
						class={cn(
							'framework-tab relative z-20 px-4 py-2.5 text-sm font-medium tracking-normal transition-colors duration-150 ease-out outline-none select-none',
							frameworkStore.active === fw
								? 'text-accent'
								: 'text-foreground-muted hover:text-foreground'
						)}
						data-framework={fw}
						use:registerTab={fw}
					>
						<span class="inline-flex items-center gap-1.5">
							{#if fw === 'svelte'}
								<AppFrameworkSvelteIcon size={16} />
								<span>Svelte</span>
							{:else if fw === 'react'}
								<AppFrameworkReactIcon size={16} />
								<span>React</span>
							{:else}
								<AppFrameworkVueIcon size={16} />
								<span>Vue</span>
							{/if}
						</span>
					</button>
				{/each}
			</div>
			<CopyCodeButton code={activeCode} class="mr-2" />
		</div>
		<div
			class="min-h-12.5 p-4 [&>div]:mt-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:shadow-none [&>div]:[box-shadow:none]!"
		>
			<Pre code="" unstyled={true}>
				{#each frameworks as fw (fw)}
					<div
						class="framework-code"
						data-framework={fw}
						data-active={frameworkStore.active === fw}
					>
						<div class="shiki-theme-light">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html highlighted[fw].light}
						</div>
						<div class="shiki-theme-dark">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html highlighted[fw].dark}
						</div>
					</div>
				{/each}
			</Pre>
		</div>
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

	.framework-tab::after {
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

	.framework-code {
		display: none;
	}

	.framework-code[data-active='true'] {
		display: block;
	}

	:global(html[data-motiongpu-framework='svelte']) .framework-code[data-framework='svelte'],
	:global(html[data-motiongpu-framework='react']) .framework-code[data-framework='react'],
	:global(html[data-motiongpu-framework='vue']) .framework-code[data-framework='vue'] {
		display: block;
	}

	:global(html[data-motiongpu-framework='react'])
		.framework-code[data-active='true']:not([data-framework='react']),
	:global(html[data-motiongpu-framework='vue'])
		.framework-code[data-active='true']:not([data-framework='vue']) {
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
