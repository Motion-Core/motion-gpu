<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { blur, fly } from 'svelte/transition';
	import type { ThemedToken } from 'shiki';

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

	function animate(ts: number) {
		if (lastTs === 0) lastTs = ts;
		elapsedMs += ts - lastTs;
		if (elapsedMs > totalCycleMs * 1000) {
			elapsedMs %= totalCycleMs;
		}
		lastTs = ts;
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
		rafId = requestAnimationFrame(animate);
		return () => {
			stopAnimation();
		};
	});
</script>

<div class="grid w-full text-background">
	<div class="relative grid grid-cols-2 items-center overflow-hidden">
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2 bg-background transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
			style={tabIndicatorStyle}
		></div>
		{#each files as file, index (file.id)}
			<button
				type="button"
				onclick={() => setActive(index)}
				class={`relative z-10 w-full px-3 py-1 font-mono text-xs transition-colors duration-300 ${
					index === activeIndex ? 'text-foreground' : 'text-foreground/70 hover:text-foreground'
				}`}
			>
				{file.label}
			</button>
		{/each}
	</div>
	<div class="grid gap-3 bg-background p-4">
		<div class="overflow-hidden bg-white">
			{#if !isReady}
				<div class="grid h-72 place-items-center font-mono text-xs text-foreground sm:h-96">
					loading preview...
				</div>
			{:else if error}
				<div
					class="grid h-72 place-items-center px-4 text-center font-mono text-xs text-red-500 sm:h-96"
				>
					{error}
				</div>
			{:else}
				<div class="h-72 overflow-auto overscroll-none sm:h-96">
					<div class="grid min-w-max grid-cols-[3.25rem_auto] font-mono text-xs leading-5">
						<div class="bg-background-muted py-3 text-right text-xs text-foreground">
							{#each lineNumbers as line (line)}
								<div class="px-3 py-0.5">{line}</div>
							{/each}
						</div>
						<div class="py-3">
							<div class="grid [grid-template-areas:'code']">
								{#key activeFile.id}
									<div
										class="[grid-area:code]"
										in:fly={{ x: 20, duration: 360, easing: cubicOut }}
										out:fly={{ x: -20, duration: 360, easing: cubicOut }}
									>
										<div
											in:blur={{ amount: 8, duration: 300 }}
											out:blur={{ amount: 8, duration: 300 }}
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
	<div class="mt-3 grid grid-cols-2 gap-3">
		<div class="h-1 w-full overflow-hidden bg-background">
			<div class="h-full bg-foreground/35" style={`width:${(progress[0] * 100).toFixed(2)}%`}></div>
		</div>
		<div class="h-1 w-full overflow-hidden bg-background">
			<div class="h-full bg-foreground/35" style={`width:${(progress[1] * 100).toFixed(2)}%`}></div>
		</div>
	</div>
</div>
