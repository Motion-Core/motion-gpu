<script module lang="ts">
	let componentPreviewCounter = 0;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { cn } from '$lib/utils/cn';
	import { getHighlighter } from '$lib/utils/highlighter';
	import ScrollArea from '../ui/ScrollArea.svelte';
	import ShikiCodeBlock from './ShikiCodeBlock.svelte';
	import CopyCodeButton from './markdown/CopyCodeButton.svelte';

	type SourceTab = {
		name: string;
		code: string;
		language?: string;
	};

	type ComponentProps = {
		code?: string;
		language?: string;
		label?: string;
		children?: Snippet;
		codeSlot?: Snippet;
		sources?: SourceTab[];
		class?: string;
		[key: string]: unknown;
	};

	const {
		children,
		codeSlot,
		code: providedCode,
		language: providedLanguage,
		label: providedLabel,
		sources: providedSources,
		class: className = '',
		...restProps
	}: ComponentProps = $props();
	componentPreviewCounter += 1;
	const tabsInstanceId = `component-preview-${componentPreviewCounter.toString()}`;
	const panelId = `${tabsInstanceId}-panel`;
	const codeScrollId = `${tabsInstanceId}-code-scroll`;

	let previewKey = $state(0);

	const tabs = $derived(
		(() => {
			const normalized =
				providedSources?.filter((tab): tab is SourceTab => Boolean(tab.code)) ?? [];

			if (normalized.length > 0) {
				return normalized;
			}

			if (providedCode) {
				return [
					{
						name: providedLabel ?? 'Code',
						code: providedCode,
						language: providedLanguage
					}
				];
			}

			return [];
		})()
	);

	let activeTab = $state(0);
	let tabList = $state<HTMLDivElement | null>(null);
	let activeIndicatorLeft = $state(0);
	let activeIndicatorWidth = $state(0);
	let pendingIndicatorFrame: number | null = null;

	const tabRefs = new SvelteMap<number, HTMLButtonElement>();

	const selectedTab = $derived(
		tabs.length === 0 ? 0 : Math.min(activeTab, Math.max(0, tabs.length - 1))
	);
	const activeSource = $derived(tabs.at(selectedTab) ?? null);
	const activeTabId = $derived(`${tabsInstanceId}-tab-${selectedTab.toString()}`);

	const highlightedSources = $derived.by(() => {
		const highlighter = getHighlighter();
		const highlightedSources: Record<string, { light: string; dark: string }> = {};

		for (const tab of tabs) {
			const lang = tab.language ?? 'typescript';
			highlightedSources[tab.name] = {
				light: highlighter.codeToHtml(tab.code, {
					lang,
					theme: 'github-light',
					tabindex: false
				}),
				dark: highlighter.codeToHtml(tab.code, {
					lang,
					theme: 'github-dark',
					tabindex: false
				})
			};
		}

		return highlightedSources;
	});

	function setActiveTab(index: number) {
		activeTab = index;
	}

	function registerTab(node: HTMLElement, index: number) {
		tabRefs.set(index, node as HTMLButtonElement);

		return {
			update(nextIndex: number) {
				if (nextIndex === index) return;
				tabRefs.delete(index);
				index = nextIndex;
				tabRefs.set(index, node as HTMLButtonElement);
			},
			destroy() {
				tabRefs.delete(index);
			}
		};
	}

	function updateActiveIndicator() {
		const activeTabElement = tabRefs.get(selectedTab);

		if (!tabList || !activeTabElement) {
			activeIndicatorLeft = 0;
			activeIndicatorWidth = 0;
			return;
		}

		activeIndicatorLeft = activeTabElement.offsetLeft;
		activeIndicatorWidth = activeTabElement.offsetWidth;
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
		});
	}

	function focusTabByIndex(index: number) {
		const tabElement = document.getElementById(`${tabsInstanceId}-tab-${index.toString()}`);
		if (tabElement instanceof HTMLButtonElement) {
			tabElement.focus();
		}
	}

	function handleTabKeydown(event: KeyboardEvent, index: number) {
		if (!tabs.length) return;
		const lastIndex = tabs.length - 1;
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

	$effect(() => {
		const currentSelectedTab = selectedTab;
		const currentTabList = tabList;
		const currentTabsLength = tabs.length;
		void currentSelectedTab;
		void currentTabList;
		void currentTabsLength;

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

<section
	class={cn('card-outer relative w-full rounded-lg bg-background-inset p-1.5')}
	{...restProps}
>
	<div class="flex h-full flex-col rounded-md">
		<div
			class="relative flex min-h-96 flex-1 flex-col items-center justify-center overflow-hidden rounded-md bg-background card"
		>
			<div class="group/preview relative flex h-full w-full flex-1 flex-col">
				<ScrollArea
					mode="both"
					id="component-preview-live"
					class={cn('w-full flex-1', className)}
					viewportClass="min-h-full w-full flex flex-col"
				>
					<div class="flex w-full flex-1 flex-col items-center justify-center">
						{#key previewKey}
							{#if children}
								{@render children()}
							{/if}
						{/key}
					</div>
				</ScrollArea>
			</div>
		</div>
		<div
			class="relative mt-2 flex flex-1 flex-col overflow-hidden rounded-md rounded-b-md bg-background card"
		>
			{#if tabs.length}
				<div
					class="relative flex items-center text-sm after:absolute after:inset-x-0 after:bottom-0 after:h-px after:guide-duotone after:content-['']"
				>
					<div
						class="relative flex flex-1 items-center overflow-x-auto"
						role="tablist"
						aria-label="Source files"
						bind:this={tabList}
					>
						{#if activeIndicatorWidth > 0}
							<div
								class="tab-active-line pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 transition-[transform,width] duration-150 ease-out motion-reduce:transition-none"
								style={`
									width: ${activeIndicatorWidth.toString()}px;
									transform: translateX(${activeIndicatorLeft.toString()}px);
								`}
							></div>
						{/if}

						{#each tabs as tab, index (tab.name)}
							<button
								type="button"
								id={`${tabsInstanceId}-tab-${index.toString()}`}
								role="tab"
								aria-selected={index === selectedTab}
								aria-controls={panelId}
								tabindex={index === selectedTab ? 0 : -1}
								class={cn(
									'focus-ring relative z-20 px-4 py-3 text-sm font-medium tracking-normal whitespace-nowrap transition-[color,box-shadow] duration-150 ease-out outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset motion-reduce:transition-none',
									index === selectedTab
										? 'text-accent'
										: 'text-foreground-muted hover:text-foreground'
								)}
								onclick={() => {
									setActiveTab(index);
								}}
								onkeydown={(event) => {
									handleTabKeydown(event, index);
								}}
								use:registerTab={index}
							>
								{tab.name}
							</button>
						{/each}
					</div>
					<div class="mr-2 w-fit flex-none">
						{#if activeSource}
							<CopyCodeButton code={activeSource.code} />
						{/if}
					</div>
				</div>
			{/if}
			<div id={panelId} role="tabpanel" aria-labelledby={activeTabId} class="flex-1">
				<ScrollArea
					mode="both"
					id={codeScrollId}
					class="relative max-h-96"
					viewportTabbable={false}
				>
					<div
						class="p-4 text-sm *:mt-0 *:rounded-none *:border-0 *:bg-transparent *:p-0 *:inset-shadow-none"
					>
						{#if activeSource}
							<ShikiCodeBlock
								code=""
								htmlLight={highlightedSources[activeSource.name].light}
								htmlDark={highlightedSources[activeSource.name].dark}
								unstyled={true}
								scrollable={false}
							/>
						{:else if codeSlot}
							{@render codeSlot()}
						{/if}
					</div>
				</ScrollArea>
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
	</style>
</section>
