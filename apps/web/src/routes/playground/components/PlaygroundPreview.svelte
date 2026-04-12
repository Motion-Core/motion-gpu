<script lang="ts">
	import type { PlaygroundController } from '../playground-controller.svelte';

	let {
		controller,
		onPreviewFrameChange
	}: {
		controller: PlaygroundController;
		onPreviewFrameChange: (frame: HTMLIFrameElement | null) => void;
	} = $props();

	const registerPreviewFrame = (node: HTMLIFrameElement) => {
		onPreviewFrameChange(node);
		return {
			destroy() {
				onPreviewFrameChange(null);
			}
		};
	};
</script>

<section
	class="inset-shadow flex min-h-0 flex-col overflow-hidden rounded-md bg-background-inset p-px"
>
	<div class="relative min-h-0 flex-1 overflow-hidden rounded-[calc(var(--radius-base)*2.75)]">
		{#key controller.previewFrameKey}
			<iframe
				use:registerPreviewFrame
				title="Playground preview"
				src={controller.previewUrl}
				class="h-full w-full overflow-hidden rounded-[calc(var(--radius-base)*2.5)]"
				loading="eager"
				sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
				referrerpolicy="no-referrer"
			></iframe>
		{/key}
	</div>

	{#if controller.errorMessage}
		<div class="px-3 py-2">
			<p class="font-mono text-xs font-normal whitespace-pre-wrap text-red-500" role="alert">
				{controller.errorMessage}
			</p>
			<div class="inset-shadow mt-2 inline-flex rounded-sm bg-background-inset p-1.5">
				<button
					type="button"
					class="card inline-flex items-center rounded-[5px] bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors duration-150 ease-out hover:bg-background-muted"
					onclick={controller.retryRuntime}
				>
					Retry runtime
				</button>
			</div>
		</div>
	{/if}
</section>
