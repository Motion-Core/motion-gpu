<script lang="ts">
	import { onMount } from 'svelte';
	import type { ThemedToken } from 'shiki';
	import Button from '../ui/Button.svelte';

	type PreviewFile = {
		id: string;
		label: string;
		code: string;
	};

	interface Props {
		files: readonly [PreviewFile, PreviewFile];
	}

	let { files }: Props = $props();

	const cycleMs = 5600;
	const totalCycleMs = cycleMs * 2;

	let elapsedMs = $state(0);
	let highlighted = $state<Record<string, ThemedToken[][]>>({});
	let error = $state<string | null>(null);
	let isReady = $state(false);
	let previewPanel = $state<HTMLDivElement | null>(null);

	function normalizeCode(code: string): string {
		const normalized = code.replace(/\r\n?/g, '\n');
		return normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
	}

	const normalizedFiles = $derived(
		files.map((file) => {
			const normalizedCode = normalizeCode(file.code);
			return {
				...file,
				normalizedCode,
				lines: normalizedCode.split('\n')
			};
		})
	);

	const cyclePosMs = $derived(elapsedMs % totalCycleMs);
	const activeIndex = $derived(cyclePosMs < cycleMs ? 0 : 1);

	const activeFile = $derived(normalizedFiles[activeIndex] ?? normalizedFiles[0]);
	const activeLines = $derived(highlighted[activeFile.id] ?? []);
	const activeTabId = $derived(`code-preview-tab-${activeFile.id}`);

	function tokenStyle(token: ThemedToken): string {
		const styles: string[] = [];
		if (token.color) styles.push(`color:${token.color}`);
		if (token.fontStyle && (token.fontStyle & 1) !== 0) styles.push('font-style:italic');
		if (token.fontStyle && (token.fontStyle & 2) !== 0) styles.push('font-weight:700');
		if (token.fontStyle && (token.fontStyle & 4) !== 0) styles.push('text-decoration:underline');
		return styles.join(';');
	}

	async function loadHighlightedTokens() {
		try {
			const { codeToTokens } = await import('shiki');
			const entries = await Promise.all(
				normalizedFiles.map(async (file) => {
					const result = await codeToTokens(file.normalizedCode, {
						lang: 'svelte',
						theme: 'github-light'
					});
					return [file.id, result.tokens] as const;
				})
			);
			highlighted = Object.fromEntries(entries);
			isReady = true;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load code preview';
			isReady = true;
		}
	}

	function setActive(index: number) {
		elapsedMs = index === 0 ? 0 : cycleMs;
	}

	function focusTab(index: number) {
		const tabId = `code-preview-tab-${files[index]?.id}`;
		const tab = document.getElementById(tabId) as HTMLButtonElement | null;
		tab?.focus();
	}

	function handleTabKeydown(event: KeyboardEvent, currentIndex: number) {
		switch (event.key) {
			case 'ArrowRight': {
				event.preventDefault();
				const next = (currentIndex + 1) % files.length;
				setActive(next);
				focusTab(next);
				break;
			}
			case 'ArrowLeft': {
				event.preventDefault();
				const previous = (currentIndex - 1 + files.length) % files.length;
				setActive(previous);
				focusTab(previous);
				break;
			}
			case 'Home': {
				event.preventDefault();
				setActive(0);
				focusTab(0);
				break;
			}
			case 'End': {
				event.preventDefault();
				const last = files.length - 1;
				setActive(last);
				focusTab(last);
				break;
			}
		}
	}

	onMount(() => {
		void loadHighlightedTokens();
	});

	$effect(() => {
		void activeFile.id;
		if (!previewPanel) return;
		previewPanel.scrollTop = 0;
	});
</script>

<div
	class="grid w-full border border-border text-background"
	role="region"
	aria-label="Code preview"
>
	<div class="grid items-center gap-2">
		<div
			class="relative flex h-8 w-full items-center border-b border-border"
			role="tablist"
			aria-label="Preview files"
		>
			{#each files as file, index (file.id)}
				<div class="group inline-flex shrink-0 items-center">
					<Button
						type="button"
						variant="ghost"
						size="none"
						role="tab"
						id={`code-preview-tab-${file.id}`}
						aria-selected={index === activeIndex}
						aria-controls="code-preview-panel"
						tabindex={index === activeIndex ? 0 : -1}
						onclick={() => setActive(index)}
						onkeydown={(event: KeyboardEvent) => handleTabKeydown(event, index)}
						class={`relative z-10 justify-start border-t border-r px-3 py-2 font-mono text-xs font-[350] tracking-normal transition-colors  focus-visible:ring-offset-0 ${
							index === activeIndex
								? 'border-border bg-white text-foreground hover:bg-white'
								: 'border-t-border/40 border-r-border bg-background text-foreground/70 hover:bg-background hover:text-foreground'
						}`}
					>
						<span>{file.label}</span>
					</Button>
				</div>
			{/each}
		</div>
	</div>

	<div class="grid gap-3">
		<div class="overflow-hidden bg-white">
			{#if !isReady}
				<div
					class="grid h-72 place-items-center font-mono text-xs text-foreground sm:h-96"
					role="status"
				>
					loading preview...
				</div>
			{:else if error}
				<div
					class="grid h-72 place-items-center px-4 text-center font-mono text-xs text-red-500 sm:h-96"
					role="alert"
				>
					{error}
				</div>
			{:else}
				<div
					id="code-preview-panel"
					class="h-72 overflow-auto overscroll-none sm:h-96"
					role="tabpanel"
					tabindex="0"
					aria-live="off"
					aria-labelledby={activeTabId}
					bind:this={previewPanel}
				>
					<div class="grid min-w-max font-mono text-xs leading-5 [grid-template-areas:'preview']">
						{#key activeFile.id}
							<div class="grid min-w-max grid-cols-[3.25rem_auto] [grid-area:preview]">
								<div
									class="border-r border-border py-0.5 text-right text-xs text-[#BABBBC]"
									aria-hidden="true"
								>
									{#each activeFile.lines as lineText, lineIndex (`line-${lineIndex}-${lineText.length}`)}
										<div class="px-3 py-0.5 text-center">{lineIndex + 1}</div>
									{/each}
								</div>

								<div class="py-0.5">
									<div>
										<div>
											{#if activeLines.length > 0}
												{#each activeFile.lines as rawLine, lineIndex (`line-${lineIndex}`)}
													<div class="px-4 whitespace-pre">
														{#if activeLines[lineIndex] && activeLines[lineIndex].length > 0}
															{#each activeLines[lineIndex] as token, tokenIndex (`token-${token.offset}-${tokenIndex}`)}
																<span style={tokenStyle(token)}>{token.content}</span>
															{/each}
														{:else}
															{rawLine || ' '}
														{/if}
													</div>
												{/each}
											{:else}
												{#each activeFile.lines as line, lineIndex (`raw-${lineIndex}`)}
													<div class="px-4 whitespace-pre">{line || ' '}</div>
												{/each}
											{/if}
										</div>
									</div>
								</div>
							</div>
						{/key}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
