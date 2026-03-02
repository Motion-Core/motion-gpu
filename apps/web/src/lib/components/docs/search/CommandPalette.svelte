<script lang="ts">
	import { goto, afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';
	import { searchState } from '$lib/stores/search.svelte';
	import { searchDocs } from '$lib/utils/docs-search';
	import { cn } from '$lib/utils/cn';
	import Search from 'carbon-icons-svelte/lib/Search.svelte';

	let query = $state('');
	let selectedIndex = $state(0);
	let inputRef = $state<HTMLInputElement | null>(null);
	let contentHeight = $state(0);
	const results = $derived(searchDocs(query));

	function close() {
		searchState.close();
	}

	function handleGlobalShortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			searchState.toggle();
		}
	}

	function selectResult(index: number) {
		const result = results[index];
		if (!result) return;
		if (result.anchor)
			void goto(resolve((`${result.href}${result.anchor}`) as '/'), { noScroll: true });
		else void goto(resolve(result.href as '/'));
		close();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!searchState.isOpen) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}

		if (results.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % results.length;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + results.length) % results.length;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			selectResult(selectedIndex);
		}
	}

	function highlight(text: string, search: string) {
		if (!search.trim()) return [{ text, highlighted: false }];

		const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escapedSearch})`, 'gi');
		const parts = text.split(regex);

		return parts
			.filter((part) => part.length > 0)
			.map((part) => ({
				text: part,
				highlighted: part.toLowerCase() === search.toLowerCase()
			}));
	}

	onMount(() => {
		window.addEventListener('keydown', handleGlobalShortcut);
		return () => {
			window.removeEventListener('keydown', handleGlobalShortcut);
		};
	});

	afterNavigate(() => {
		const hash = typeof location !== 'undefined' ? location.hash : '';
		if (!hash) return;
		const id = hash.slice(1);
		let tries = 0;
		const attempt = () => {
			const el = document.getElementById(id);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
				return;
			}
			if (tries++ < 30) setTimeout(attempt, 50);
		};
		attempt();
	});

	$effect(() => {
		if (!searchState.isOpen) return;
		selectedIndex = 0;
		requestAnimationFrame(() => inputRef?.focus());
	});

	$effect(() => {
		if (!searchState.isOpen) return;
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if searchState.isOpen}
	<div
		class="fixed inset-0 z-120 bg-background/85"
		role="presentation"
		onclick={close}
		transition:fade={{ duration: 150 }}
	></div>

	<div
		class="fixed inset-0 z-121 flex items-start justify-center p-4 pt-[10vh]"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && close()}
		onkeydown={(event) => {
			if (event.key === 'Escape') close();
		}}
	>
		<div
			class="w-full max-w-3xl border border-border bg-card"
			transition:scale={{ duration: 300, start: 0.95, easing: cubicOut }}
			onoutroend={() => {
				query = '';
				contentHeight = 0;
			}}
		>
			<div class="flex items-center gap-2 border-b border-border px-3">
				<Search size={20} class="text-foreground-muted" aria-hidden="true" />
				<input
					bind:this={inputRef}
					bind:value={query}
					class="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
					placeholder="Search MotionGPU docs"
					aria-label="Search MotionGPU docs"
				/>
				<span class="border border-border px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted bg-background"
					>ESC</span
				>
			</div>

			<div
				class="overflow-hidden transition-[height] duration-300 ease-out"
				style={`height: ${contentHeight}px`}
			>
				<div bind:clientHeight={contentHeight}>
					{#if results.length > 0}
						<div class="max-h-[60vh] overflow-y-auto">
							{#each results as result, index (`${result.href}${result.anchor ?? ''}${index}`)}
								{@const isChild = result.matchType === 'heading' || result.matchType === 'content'}
								<button
									type="button"
									onclick={() => selectResult(index)}
									onmouseenter={() => (selectedIndex = index)}
									class={cn(
										'group relative w-full border-b border-border px-3 py-2 text-left transition-colors',
										isChild && 'pl-7',
										selectedIndex === index
											? 'bg-background-muted/55 text-foreground'
											: 'bg-card text-foreground hover:bg-background'
									)}
								>
									{#if isChild}
										<div
											class={cn(
												'absolute top-0 bottom-0 left-3 w-px',
												selectedIndex === index ? 'bg-accent' : 'bg-foreground/18'
											)}
										></div>
									{/if}

									{#if result.matchType !== 'content'}
										<p class="text-sm tracking-tight text-foreground">
											{#each highlight(result.matchType === 'heading' ? (result.heading ?? result.title) : result.title, query) as part, partIndex (`title-${partIndex}-${part.text}`)}
												{#if part.highlighted}
													<span class="text-accent">{part.text}</span>
												{:else}
													{part.text}
												{/if}
											{/each}
										</p>
									{/if}

									{#if result.snippet}
										<p class="mt-1 line-clamp-1 text-xs text-foreground-muted">
											{#each highlight(result.snippet, query) as part, partIndex (`snippet-${partIndex}-${part.text}`)}
												{#if part.highlighted}
													<span class="text-accent">{part.text}</span>
												{:else}
													{part.text}
												{/if}
											{/each}
										</p>
									{/if}
								</button>
							{/each}
						</div>
					{:else if query.trim()}
						<p class="px-3 py-6 text-sm text-foreground-muted">No results found.</p>
					{/if}
				</div>
			</div>

			<div class="border-t border-border px-3 py-2">
				<p class="font-mono text-xs text-foreground-muted">
					Use ↑ ↓ to navigate and Enter to open.
				</p>
			</div>
		</div>
	</div>
{/if}
