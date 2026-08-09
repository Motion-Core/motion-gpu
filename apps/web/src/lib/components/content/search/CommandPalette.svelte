<script lang="ts">
	import { searchState } from '$lib/stores/search.svelte';
	import { contentUiDefaults, type SectionUiConfig } from '$lib/config/content-ui';
	import { searchContent } from '$lib/utils/search';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils/cn';
	import ScrollArea from '$lib/components/ui/ScrollArea.svelte';
	import { onMount } from 'svelte';
	import { AppEnterIcon, AppSearchIcon } from '$lib/components/icons';
	import { motionDuration, motionDistance } from '$lib/utils/motion';

	const { searchConfig = contentUiDefaults.search }: { searchConfig?: SectionUiConfig['search'] } =
		$props();

	let query = $state('');
	let results = $derived(searchContent(query, searchConfig));
	let selectedIndex = $state(0);
	let inputRef = $state<HTMLInputElement>();
	let contentHeight = $state(0);
	let resultsRef = $state<HTMLDivElement | null>(null);
	let selectedIndicatorTop = $state(0);
	let selectedIndicatorHeight = $state(0);
	let selectedIndicatorVisible = $state(false);
	let selectedGlowLeft = $state(0);
	let selectedGlowTop = $state(0);
	let selectedGlowHeight = $state(0);
	let selectedGlowVisible = $state(false);
	let selectedResultElement: HTMLElement | null = null;
	let selectedResultIsChild = false;
	let pendingSelectedIndicatorFrame: number | null = null;
	let restoreFocusElement: HTMLElement | null = null;
	const resultsListId = 'command-palette-results';

	function resultId(index: number) {
		return `command-palette-result-${index.toString()}`;
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		const hotkey = searchConfig.hotkey;
		if (!hotkey.enabled || !searchConfig.enabled) {
			return;
		}

		const matchesModifier = hotkey.metaOrCtrl ? e.metaKey || e.ctrlKey : true;
		const matchesKey = e.key.toLowerCase() === hotkey.key.toLowerCase();
		if (matchesModifier && matchesKey) {
			e.preventDefault();
			if (searchState.isOpen) {
				close();
			} else {
				searchState.open();
			}
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleGlobalKeydown);
		return () => {
			window.removeEventListener('keydown', handleGlobalKeydown);
		};
	});

	$effect(() => {
		if (!searchConfig.enabled) return;
		if (searchState.isOpen && inputRef) {
			if (
				!restoreFocusElement &&
				document.activeElement instanceof HTMLElement &&
				document.activeElement !== inputRef
			) {
				restoreFocusElement = document.activeElement;
			}
			inputRef.focus();
		}
	});

	$effect(() => {
		void results;
		selectedIndex = 0;
	});

	function updateSelectedIndicators() {
		if (!resultsRef || !selectedResultElement) {
			selectedIndicatorVisible = false;
			selectedGlowVisible = false;
			return;
		}

		const resultsRect = resultsRef.getBoundingClientRect();
		const nodeRect = selectedResultElement.getBoundingClientRect();

		selectedIndicatorTop = nodeRect.top - resultsRect.top;
		selectedIndicatorHeight = nodeRect.height;
		selectedIndicatorVisible = true;

		selectedGlowLeft = nodeRect.left - resultsRect.left + 12;
		selectedGlowTop = selectedIndicatorTop;
		selectedGlowHeight = selectedIndicatorHeight;
		selectedGlowVisible = selectedResultIsChild;
	}

	function scheduleSelectedIndicatorUpdate() {
		if (typeof window === 'undefined') {
			updateSelectedIndicators();
			return;
		}

		if (pendingSelectedIndicatorFrame !== null) {
			window.cancelAnimationFrame(pendingSelectedIndicatorFrame);
		}

		pendingSelectedIndicatorFrame = window.requestAnimationFrame(() => {
			pendingSelectedIndicatorFrame = null;
			updateSelectedIndicators();
		});
	}

	function registerResult(node: HTMLElement, params: { selected: boolean; child: boolean }) {
		if (params.selected) {
			selectedResultElement = node;
			selectedResultIsChild = params.child;
			scheduleSelectedIndicatorUpdate();
		}

		return {
			update(nextParams: { selected: boolean; child: boolean }) {
				if (nextParams.selected) {
					selectedResultElement = node;
					selectedResultIsChild = nextParams.child;
					scheduleSelectedIndicatorUpdate();
				} else if (selectedResultElement === node) {
					selectedResultElement = null;
					selectedResultIsChild = false;
					scheduleSelectedIndicatorUpdate();
				}
			},
			destroy() {
				if (selectedResultElement === node) {
					selectedResultElement = null;
					selectedResultIsChild = false;
					scheduleSelectedIndicatorUpdate();
				}
			}
		};
	}

	$effect(() => {
		const index = selectedIndex;
		const resultCount = results.length;
		void index;
		void resultCount;

		scheduleSelectedIndicatorUpdate();

		if (typeof window === 'undefined') return;

		window.addEventListener('resize', scheduleSelectedIndicatorUpdate);

		return () => {
			window.removeEventListener('resize', scheduleSelectedIndicatorUpdate);
			if (pendingSelectedIndicatorFrame !== null) {
				window.cancelAnimationFrame(pendingSelectedIndicatorFrame);
				pendingSelectedIndicatorFrame = null;
			}
		};
	});

	function close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
		const focusTarget = restoreFocusElement;
		restoreFocusElement = null;
		searchState.close();

		if (restoreFocus && focusTarget) {
			requestAnimationFrame(() => {
				focusTarget.focus();
			});
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!searchState.isOpen) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}

		if (e.key === 'Tab') {
			e.preventDefault();
			inputRef?.focus();
			return;
		}

		if (results.length === 0) {
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + results.length) % results.length;
		} else if (e.key === 'Home') {
			e.preventDefault();
			selectedIndex = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			selectedIndex = results.length - 1;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (results[selectedIndex]) {
				selectResult(results[selectedIndex]);
			}
		}
	}

	$effect(() => {
		if (!searchConfig.enabled) return;
		if (searchState.isOpen) {
			window.addEventListener('keydown', handleKeydown);
			return () => {
				window.removeEventListener('keydown', handleKeydown);
			};
		}
	});

	function selectResult(result: ReturnType<typeof searchContent>[number]) {
		const href = `${result.slug}${result.anchor ?? ''}`;
		// @ts-expect-error arg cannot be cast as `resolve`'s expected type
		void goto(resolve(href));
		close({ restoreFocus: false });
	}

	onNavigate(() => {
		close({ restoreFocus: false });
	});

	function highlight(text: string, search: string) {
		if (!search.trim()) return [{ text, highlight: false }];

		const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escapedSearch})`, 'gi');
		const parts = text.split(regex);

		return parts.map((part) => ({
			text: part,
			highlight: part.toLowerCase() === search.toLowerCase()
		}));
	}
</script>

{#if searchConfig.enabled && searchState.isOpen}
	<div
		class="fixed inset-0 z-60 bg-background-inset/80 backdrop-blur-sm"
		transition:fade={{ duration: motionDuration(150) }}
		onclick={() => {
			close();
		}}
		role="presentation"
	></div>

	<div
		class="fixed inset-0 z-60 flex items-start justify-center p-4 sm:pt-[10vh]"
		role="dialog"
		aria-modal="true"
		aria-label={searchConfig.dialogPlaceholder}
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') close();
		}}
	>
		<div
			class="relative w-full max-w-164 transform-gpu rounded-lg bg-background shadow-2xl card"
			role="document"
			transition:scale={{
				duration: motionDuration(300),
				start: 1 - motionDistance(0.05),
				easing: cubicOut
			}}
			onoutroend={() => {
				query = '';
				contentHeight = 0;
			}}
		>
			<!--
				Intentional focus-ring exception: DOM focus stays on the search input while the
				active result indicator communicates keyboard position. A second ring around
				the palette input would compete with that selected-result treatment.
			-->
			<div
				class="relative flex items-center px-3 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:guide-duotone after:content-['']"
			>
				<AppSearchIcon size={24} class="mr-2 text-foreground-muted/70" />
				<input
					bind:this={inputRef}
					bind:value={query}
					class="command-palette-input flex h-12 w-full bg-transparent text-base tracking-normal text-foreground placeholder:text-foreground-muted/70 focus:outline-none focus-visible:border-none! focus-visible:ring-0! focus-visible:ring-offset-0! focus-visible:outline-none!"
					placeholder={searchConfig.dialogPlaceholder}
					aria-label={searchConfig.dialogPlaceholder}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded="true"
					aria-controls={results.length > 0 ? resultsListId : undefined}
					aria-activedescendant={results[selectedIndex] ? resultId(selectedIndex) : undefined}
				/>
				<kbd
					class="pointer-events-none inset-shadow relative hidden h-5 items-center gap-1 rounded-[calc(var(--radius-base)*1.5)] bg-background-inset px-1.5 font-mono text-[10px] font-medium tracking-normal text-foreground-muted/70 select-none sm:flex"
				>
					ESC
				</kbd>
			</div>

			<div
				class="overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
				style="height: {contentHeight}px"
			>
				<div bind:clientHeight={contentHeight}>
					{#if results.length > 0}
						<ScrollArea
							viewportStyle="mask-image: linear-gradient(to bottom, transparent, black 8px, black calc(100% - 8px), transparent); -webkit-mask-image: linear-gradient(to bottom, transparent, black 8px, black calc(100% - 8px), transparent);"
							viewportClass="max-h-96 p-2"
							thumbTabbable={false}
							viewportTabbable={false}
						>
							<div
								id={resultsListId}
								role="listbox"
								aria-label="Search results"
								class="command-results relative flex flex-col"
								bind:this={resultsRef}
								style={`
										--command-selected-top: ${selectedIndicatorTop.toString()}px;
										--command-selected-height: ${selectedIndicatorHeight.toString()}px;
										--command-selected-opacity: ${selectedIndicatorVisible ? '1' : '0'};
										--command-glow-left: ${selectedGlowLeft.toString()}px;
										--command-glow-top: ${selectedGlowTop.toString()}px;
										--command-glow-height: ${selectedGlowHeight.toString()}px;
										--command-glow-opacity: ${selectedGlowVisible ? '1' : '0'};
									`}
							>
								{#each results as result, i (`${result.slug}${result.anchor ?? ''}${i.toString()}`)}
									{@const isChild =
										result.matchType === 'heading' || result.matchType === 'content'}
									{@const isSelected = i === selectedIndex}
									<button
										id={resultId(i)}
										type="button"
										role="option"
										aria-selected={isSelected}
										tabindex="-1"
										class={cn(
											'group relative z-10 flex w-full flex-col items-start gap-1 rounded-sm px-3 py-2 text-sm font-medium tracking-normal transition-colors duration-150 ease-out motion-reduce:transition-none',
											isChild && 'pl-8',
											isSelected ? 'text-foreground' : 'text-foreground hover:text-foreground'
										)}
										onclick={() => {
											selectResult(result);
										}}
										onmouseenter={() => (selectedIndex = i)}
										use:registerResult={{ selected: isSelected, child: isChild }}
									>
										{#if isChild}
											<div class={cn('absolute top-0 bottom-0 left-3 w-px guide')}></div>
										{/if}

										<div class="flex w-full flex-col items-start gap-0.5">
											{#if result.matchType !== 'content'}
												<div class="flex items-center gap-2 font-medium tracking-normal">
													{#if result.matchType === 'heading'}
														<span class="opacity-70">#</span>
													{/if}
													<span>
														{#each highlight(result.heading ?? result.title, query) as part, index (index)}
															{#if part.highlight}
																<span class="text-accent">{part.text}</span>
															{:else}
																{part.text}
															{/if}
														{/each}
													</span>
												</div>
											{/if}
											{#if result.snippet}
												<div
													class="line-clamp-1 text-left text-xs font-medium tracking-normal text-foreground-muted"
												>
													{#each highlight(result.snippet, query) as part, index (index)}
														{#if part.highlight}
															<span class="text-accent">{part.text}</span>
														{:else}
															{part.text}
														{/if}
													{/each}
												</div>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						</ScrollArea>
					{:else if query}
						<div class="py-6 text-center text-sm tracking-normal text-foreground-muted/70">
							{searchConfig.noResultsLabel}
						</div>
					{/if}
				</div>
			</div>
			<div
				class="relative flex w-full flex-row items-center justify-start gap-2 rounded-b-lg bg-background p-2 after:absolute after:inset-x-0 after:top-0 after:h-px after:guide-duotone after:content-['']"
			>
				<kbd
					class="pointer-events-none inset-shadow relative hidden h-5 items-center gap-1 rounded-[calc(var(--radius-base)*1.5)] bg-background-inset px-1.5 font-mono text-[10px] font-medium text-foreground-muted/70 select-none sm:flex"
				>
					<AppEnterIcon class="size-3" />
				</kbd>
				<span class="text-xs font-medium tracking-normal text-foreground-muted/70">
					{searchConfig.submitHintLabel}
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.command-palette-input:focus,
	.command-palette-input:focus-visible {
		outline: none !important;
		outline-color: transparent !important;
		outline-offset: 0 !important;
		box-shadow: none !important;
	}

	.command-results::before {
		content: '';
		position: absolute;
		inset-inline: 0px;
		top: 0;
		height: var(--command-selected-height);
		border-radius: var(--radius-sm);
		background: var(--color-background-muted);
		opacity: var(--command-selected-opacity);
		pointer-events: none;
		transform: translateY(var(--command-selected-top));
		transition:
			transform 150ms ease-out,
			height 150ms ease-out,
			opacity 150ms ease-out;
		will-change: transform, height, opacity;
		z-index: 0;
	}

	.command-results::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: var(--command-glow-height);
		border-radius: 9999px;
		background-image: linear-gradient(
			to bottom,
			transparent,
			oklch(from var(--color-accent) l c h / 0.68) 18%,
			var(--color-accent) 50%,
			oklch(from var(--color-accent) l c h / 0.68) 82%,
			transparent
		);
		filter: drop-shadow(0 0 6px oklch(from var(--color-accent) l c h / 0.38));
		opacity: var(--command-glow-opacity);
		pointer-events: none;
		transform: translate(var(--command-glow-left), var(--command-glow-top));
		transition:
			transform 150ms ease-out,
			height 150ms ease-out,
			opacity 150ms ease-out;
		will-change: transform, height, opacity;
		z-index: 20;
	}

	@media (prefers-reduced-motion: reduce) {
		.command-results::before,
		.command-results::after {
			transition: none;
			will-change: auto;
		}
	}

	@media (max-width: 1023.98px) {
		.command-results::before {
			display: none;
		}
	}
</style>
