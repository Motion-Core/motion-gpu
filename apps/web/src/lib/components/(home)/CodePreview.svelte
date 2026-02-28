<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { blur, fly } from 'svelte/transition';
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

	let rafId: number | null = null;
	let lastTs = 0;

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
	const progress = $derived(
		cyclePosMs < cycleMs
			? ([Math.min(1, cyclePosMs / cycleMs), 0] as [number, number])
			: ([1, Math.min(1, (cyclePosMs - cycleMs) / cycleMs)] as [number, number])
	);

	const activeFile = $derived(normalizedFiles[activeIndex] ?? normalizedFiles[0]);
	const activeLines = $derived(highlighted[activeFile.id] ?? []);
	const lineCount = $derived(activeFile.lines.length);
	const lineNumbers = $derived(Array.from({ length: lineCount }, (_, index) => index + 1));
	const tabIndicatorStyle = $derived(`transform:translateX(${activeIndex * 100}%);`);
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

	function animate(ts: number) {
		if (lastTs === 0) lastTs = ts;
		elapsedMs += ts - lastTs;
		if (elapsedMs > totalCycleMs) {
			elapsedMs %= totalCycleMs;
		}
		lastTs = ts;

		rafId = requestAnimationFrame(animate);
	}

	function startAnimation() {
		if (rafId !== null) return;
		rafId = requestAnimationFrame(animate);
	}

	function stopAnimation() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		lastTs = 0;
	}

	onMount(() => {
		void loadHighlightedTokens();
		startAnimation();

		return () => {
			stopAnimation();
		};
	});
</script>

<div class="grid w-full text-background" role="region" aria-label="Code preview">
	<div class="grid items-center gap-2">
		<div
			class="relative grid w-full grid-cols-2 items-center overflow-hidden"
			role="tablist"
			aria-label="Preview files"
		>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2 bg-background transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
				style={tabIndicatorStyle}
			></div>
			{#each files as file, index (file.id)}
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
					class={`relative z-10 w-full justify-center px-3 py-2 font-mono text-xs transition-colors duration-300 focus-visible:ring-offset-0 ${
						index === activeIndex ? 'text-foreground' : 'text-foreground/70 hover:text-foreground'
					}`}
				>
					{file.label}
				</Button>
			{/each}
		</div>
	</div>

	<div class="grid gap-3 bg-background p-4">
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
					class="h-72 overflow-auto overscroll-none font-normal sm:h-96"
					role="tabpanel"
					tabindex="0"
					aria-live="off"
					aria-labelledby={activeTabId}
				>
					<div class="grid min-w-max grid-cols-[3.25rem_auto] font-mono text-xs leading-5">
						<div
							class="bg-background-muted py-3 text-right text-xs text-foreground"
							aria-hidden="true"
						>
							{#each lineNumbers as line (line)}
								<div class="px-3 py-0.5">{line}</div>
							{/each}
						</div>
						<div class="py-3">
							<div class="grid [grid-template-areas:'code']">
								{#key activeFile.id}
									<div
										class="[grid-area:code]"
										in:fly={{
											x: 20,
											duration: 360,
											easing: cubicOut
										}}
										out:fly={{
											x: -20,
											duration: 360,
											easing: cubicOut
										}}
									>
										<div
											in:blur={{
												amount: 8,
												duration: 300
											}}
											out:blur={{
												amount: 8,
												duration: 300
											}}
										>
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
								{/key}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="mt-3 grid grid-cols-2 gap-3" aria-hidden="true">
		<div class="h-1 w-full overflow-hidden bg-background">
			<div class="h-full bg-foreground/35" style={`width:${(progress[0] * 100).toFixed(2)}%`}></div>
		</div>
		<div class="h-1 w-full overflow-hidden bg-background">
			<div class="h-full bg-foreground/35" style={`width:${(progress[1] * 100).toFixed(2)}%`}></div>
		</div>
	</div>
</div>
