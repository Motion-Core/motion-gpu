<script lang="ts">
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import ScrollArea from '$lib/components/ui/ScrollArea.svelte';

	import type { PlaygroundController } from '../playground-controller.svelte';

	let {
		controller,
		onEditorHostChange
	}: {
		controller: PlaygroundController;
		onEditorHostChange: (host: HTMLDivElement | null) => void;
	} = $props();

	const registerEditorHost = (node: HTMLDivElement) => {
		onEditorHostChange(node);
		return {
			destroy() {
				onEditorHostChange(null);
			}
		};
	};
</script>

<section
	class="inset-shadow flex min-h-0 flex-col overflow-hidden rounded-md bg-background-muted p-px dark:bg-background"
>
	<div class="h-8 border-b border-border">
		<ScrollArea mode="horizontal" class="h-full" viewportClass="h-full">
			<div class="flex items-stretch">
				{#each controller.openFilePaths as filePath (filePath)}
					<div
						class={`group inline-flex shrink-0 items-center rounded-t-md border-r ${
							controller.activeFilePath === filePath
								? 'border-border bg-background dark:bg-background-inset'
								: 'border-transparent bg-transparent'
						}`}
					>
						<button
							type="button"
							onclick={() => controller.switchToFile(filePath)}
							class={`px-2.5 py-2 text-left font-mono text-[11px] font-normal transition-colors duration-150 ease-out sm:px-3 sm:text-xs ${
								controller.activeFilePath === filePath
									? 'text-foreground'
									: 'text-foreground-muted hover:text-foreground'
							}`}
						>
							{filePath.split('/').at(-1)}
						</button>
						{#if controller.openFilePaths.length > 1}
							<button
								type="button"
								onclick={(event) => {
									event.stopPropagation();
									controller.closeFile(filePath);
								}}
								class="inline-flex items-center px-3 py-2 text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
								aria-label={`Close ${filePath}`}
							>
								<Close size={16} />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</ScrollArea>
	</div>

	<div
		use:registerEditorHost
		class="min-h-0 flex-1 bg-background dark:bg-background-inset"
		aria-label="Svelte component editor"
	></div>

	{#if controller.syncError}
		<p
			class="rounded-b-md border-t border-border bg-background p-px px-3 py-2 font-mono text-xs font-normal text-red-500 dark:bg-background-inset"
			role="alert"
		>
			{controller.syncError}
		</p>
	{/if}

	<section class="rounded-b-md border-t border-border bg-background p-px dark:bg-background-inset">
		{#if controller.runtimeLog}
			<details>
				<summary
					class="cursor-pointer px-3 py-2 font-mono text-xs font-medium text-foreground-muted"
				>
					Runtime log ({controller.status})
				</summary>
				<ScrollArea class="h-32" viewportClass="px-3 py-2">
					<pre class="font-mono text-[11px] leading-5 font-normal whitespace-pre-wrap text-foreground-muted"
						>{controller.runtimeLogTail}</pre
					>
				</ScrollArea>
			</details>
		{:else}
			<p class=" px-3 py-2 font-mono text-xs font-normal text-foreground-muted">
				{controller.status}
			</p>
		{/if}
	</section>
</section>
