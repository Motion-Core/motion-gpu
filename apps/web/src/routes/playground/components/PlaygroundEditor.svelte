<script lang="ts">
	import Close from 'carbon-icons-svelte/lib/Close.svelte';

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

<section class="flex min-h-0 flex-col bg-background">
	<div class="h-8 border-b border-border">
		<div class="flex items-stretch overflow-x-auto">
			{#each controller.openFilePaths as filePath (filePath)}
				<div
					class={`group inline-flex shrink-0 items-center border-r border-border ${
						controller.activeFilePath === filePath ? 'bg-background-inset' : 'bg-background'
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
	</div>

	<div
		use:registerEditorHost
		class="min-h-0 flex-1 bg-background-inset"
		aria-label="Svelte component editor"
	></div>

	{#if controller.syncError}
		<p
			class="border-t border-border bg-background px-3 py-2 font-mono text-xs font-normal text-red-500"
			role="alert"
		>
			{controller.syncError}
		</p>
	{/if}

	<section class="bg-background">
		{#if controller.runtimeLog}
			<details>
				<summary
					class="cursor-pointer px-3 py-2 font-mono text-xs font-medium text-foreground-muted"
				>
					Runtime log ({controller.status})
				</summary>
				<pre
					class="h-32 overflow-auto border-t border-border bg-background-inset px-3 py-2 font-mono text-[11px] leading-5 font-normal whitespace-pre-wrap text-foreground-muted">{controller.runtimeLogTail}</pre>
			</details>
		{:else}
			<p
				class="border-t border-border px-3 py-2 font-mono text-xs font-normal text-foreground-muted"
			>
				{controller.status}
			</p>
		{/if}
	</section>
</section>
