<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { onMount, tick, type Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import ContentSidebar from '$lib/components/content/ContentSidebar.svelte';
	import MobileSidebar from '$lib/components/content/MobileSidebar.svelte';
	import ScrollArea from '$lib/components/ui/ScrollArea.svelte';
	import { type SectionUiConfig } from '$lib/config/content-ui';
	import type { ContentItem, ContentSectionLink } from '$lib/config/navigation';
	import { cn } from '$lib/utils/cn';

	type SidebarConfig = {
		navigation: ContentItem[];
		navigationLabel: string;
		basePath: string;
		showSearch?: boolean;
		showThemeToggle?: boolean;
		showRepositoryLink?: boolean;
		repositoryUrl?: string;
		repositoryAriaLabel?: string;
		searchConfig?: SectionUiConfig['search'];
		sectionLinks?: ContentSectionLink[];
	};

	const DEFAULT_GRID_CLASS_BASE =
		'relative flex size-full min-h-0 min-w-0 lg:grid lg:grid-cols-[21rem_minmax(0,1fr)]';
	const DEFAULT_GRID_CLASS_WITH_ASIDE = '';
	const DEFAULT_SIDEBAR_SHELL_CLASS = 'hidden min-h-0 lg:block lg:h-full lg:p-4 lg:pr-0';
	const DEFAULT_CONTENT_SHELL_CLASS =
		'flex h-full min-h-0 w-full min-w-0 flex-1 lg:pt-2 lg:pr-2 lg:pb-2 lg:pl-4';
	const DEFAULT_CONTENT_WRAPPER_CLASS_BASE =
		'inset-shadow relative h-full max-h-full min-h-0 w-full min-w-0 overflow-hidden bg-background-inset pt-12 lg:grid lg:grid-cols-[minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-visible lg:rounded-xl lg:pt-0';
	const DEFAULT_CONTENT_WRAPPER_CLASS_WITH_ASIDE =
		'xl:grid-cols-[minmax(0,1fr)_14rem_2rem] 2xl:grid-cols-[minmax(0,52rem)_minmax(0,1fr)_14rem_2rem]';
	const DEFAULT_SCROLL_AREA_CLASS_BASE = 'h-full max-h-full min-h-0 w-full min-w-0 lg:row-start-1';
	const DEFAULT_SCROLL_AREA_CLASS_NO_ASIDE = '';
	const DEFAULT_SCROLL_AREA_CLASS_WITH_ASIDE = 'xl:col-start-1 xl:col-end-4 2xl:col-end-5';
	const DEFAULT_SCROLL_VIEWPORT_CLASS_BASE = 'rounded-lg overscroll-none flex flex-col';
	const DEFAULT_SCROLL_VIEWPORT_CLASS_PADDED = 'gap-8 px-4 py-8 lg:px-8';
	const DEFAULT_SCROLL_VIEWPORT_CLASS_PADDED_WITH_ASIDE =
		'max-w-[54rem] xl:max-w-[calc(100%-18rem)] 2xl:max-w-[54rem]';
	const DEFAULT_SCROLL_VIEWPORT_CLASS_COMPACT = 'h-full gap-6';
	const DEFAULT_SCROLL_VIEWPORT_STYLE =
		'mask-image: linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent); -webkit-mask-image: linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent);';

	const {
		mainId,
		scrollContainerId,
		gridClass,
		contentWrapperClass,
		scrollAreaClass,
		scrollViewportClass,
		scrollViewportStyle,
		// feature flags
		showAside = true,
		innerViewportStyle = true,
		sidebarConfig,
		main,
		aside
	}: {
		mainId: string;
		scrollContainerId: string;
		gridClass?: string;
		contentWrapperClass?: string;
		scrollAreaClass?: string;
		scrollViewportClass?: string;
		scrollViewportStyle?: string;
		showAside?: boolean;
		innerViewportStyle?: boolean;
		sidebarConfig: SidebarConfig;
		main: Snippet;
		aside?: Snippet;
	} = $props();

	const resolvedShowAside = $derived(showAside && Boolean(aside));
	const resolvedGridClass = $derived(
		gridClass ?? cn(DEFAULT_GRID_CLASS_BASE, resolvedShowAside && DEFAULT_GRID_CLASS_WITH_ASIDE)
	);
	const resolvedContentWrapperClass = $derived(
		contentWrapperClass ??
			cn(
				DEFAULT_CONTENT_WRAPPER_CLASS_BASE,
				resolvedShowAside && DEFAULT_CONTENT_WRAPPER_CLASS_WITH_ASIDE
			)
	);
	const resolvedScrollAreaClass = $derived(
		scrollAreaClass ??
			cn(
				DEFAULT_SCROLL_AREA_CLASS_BASE,
				resolvedShowAside
					? DEFAULT_SCROLL_AREA_CLASS_WITH_ASIDE
					: DEFAULT_SCROLL_AREA_CLASS_NO_ASIDE
			)
	);
	const resolvedScrollViewportClass = $derived(
		scrollViewportClass ??
			cn(
				DEFAULT_SCROLL_VIEWPORT_CLASS_BASE,
				innerViewportStyle
					? cn(
							DEFAULT_SCROLL_VIEWPORT_CLASS_PADDED,
							resolvedShowAside && DEFAULT_SCROLL_VIEWPORT_CLASS_PADDED_WITH_ASIDE
						)
					: DEFAULT_SCROLL_VIEWPORT_CLASS_COMPACT
			)
	);
	const resolvedScrollViewportStyle = $derived(
		scrollViewportStyle ?? (innerViewportStyle ? DEFAULT_SCROLL_VIEWPORT_STYLE : undefined)
	);

	const navigation = $derived(sidebarConfig.navigation);
	const navigationLabel = $derived(sidebarConfig.navigationLabel);
	const basePath = $derived(sidebarConfig.basePath);
	const showSearch = $derived(sidebarConfig.showSearch);
	const showThemeToggle = $derived(sidebarConfig.showThemeToggle);
	const showRepositoryLink = $derived(sidebarConfig.showRepositoryLink);
	const repositoryUrl = $derived(sidebarConfig.repositoryUrl);
	const repositoryAriaLabel = $derived(sidebarConfig.repositoryAriaLabel);
	const searchConfig = $derived(sidebarConfig.searchConfig);
	const sectionLinks = $derived(sidebarConfig.sectionLinks ?? []);

	const scrollPositions = new SvelteMap<string, number>();
	let hashFallbackTimer: ReturnType<typeof setTimeout> | null = null;

	function clearHashFallbackTimer() {
		if (hashFallbackTimer) {
			clearTimeout(hashFallbackTimer);
			hashFallbackTimer = null;
		}
	}

	async function scrollToHash(hash: string) {
		if (!hash) return;
		const id = hash.substring(1);

		const scrollToElement = () => {
			const element = document.getElementById(id);
			if (element) {
				element.scrollIntoView({
					behavior: 'smooth',
					block: 'start'
				});
				return true;
			}
			return false;
		};

		clearHashFallbackTimer();
		await tick().then(() => {
			if (!scrollToElement()) {
				hashFallbackTimer = setTimeout(scrollToElement, 100);
			}
		});
	}

	beforeNavigate(() => {
		const elem = document.getElementById(scrollContainerId);
		if (elem) {
			scrollPositions.set(page.url.pathname, elem.scrollTop);
		}
	});

	afterNavigate((nav) => {
		const elem = document.getElementById(scrollContainerId);
		if (elem && !page.url.hash) {
			if (nav.type === 'popstate') {
				const saved = scrollPositions.get(page.url.pathname);
				if (saved !== undefined) {
					elem.scrollTop = saved;
				}
			} else {
				elem.scrollTop = 0;
			}
		}

		if (page.url.hash) {
			void scrollToHash(page.url.hash);
		}
	});

	onMount(() => {
		const handleHashChange = () => {
			void scrollToHash(window.location.hash);
		};

		window.addEventListener('hashchange', handleHashChange);
		handleHashChange();

		return () => {
			window.removeEventListener('hashchange', handleHashChange);
			clearHashFallbackTimer();
		};
	});
</script>

<a
	href={`#${mainId}`}
	class="focus-ring sr-only fixed top-3 left-3 z-100 rounded-sm bg-foreground px-4 py-2 text-sm text-background-inset outline-none focus:not-sr-only focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
>
	Skip to main content
</a>

<main id={mainId} tabindex="-1" class="relative h-dvh bg-background text-foreground">
	<MobileSidebar
		{navigation}
		{navigationLabel}
		{basePath}
		{showSearch}
		{showThemeToggle}
		{showRepositoryLink}
		{repositoryUrl}
		{repositoryAriaLabel}
		{searchConfig}
		{sectionLinks}
	/>

	<div class={resolvedGridClass}>
		<div class={DEFAULT_SIDEBAR_SHELL_CLASS}>
			<ContentSidebar
				{navigation}
				{navigationLabel}
				{basePath}
				{showSearch}
				{showThemeToggle}
				{showRepositoryLink}
				{repositoryUrl}
				{repositoryAriaLabel}
				{searchConfig}
				{sectionLinks}
			/>
		</div>

		<div class={DEFAULT_CONTENT_SHELL_CLASS}>
			<div class={resolvedContentWrapperClass}>
				<ScrollArea
					mode="vertical"
					id={scrollContainerId}
					class={resolvedScrollAreaClass}
					viewportClass={resolvedScrollViewportClass}
					viewportStyle={resolvedScrollViewportStyle}
				>
					{@render main()}
				</ScrollArea>

				{#if aside && resolvedShowAside}
					{@render aside()}
				{/if}
			</div>
		</div>
	</div>
</main>
