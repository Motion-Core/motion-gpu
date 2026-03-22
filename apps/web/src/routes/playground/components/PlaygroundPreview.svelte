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

<section class="flex min-h-0 flex-col overflow-hidden bg-background">
	<div class="relative min-h-0 flex-1 bg-background-inset">
		{#key controller.previewFrameKey}
			<iframe
				use:registerPreviewFrame
				title="Playground preview"
				srcdoc={controller.previewSrcdoc}
				class="h-full w-full border-0"
				loading="eager"
				sandbox="allow-scripts allow-forms allow-modals allow-popups"
				referrerpolicy="no-referrer"
			></iframe>
		{/key}
	</div>

	{#if controller.errorMessage}
		<div class="border-t border-border bg-background px-3 py-2">
			<p class="font-mono text-xs font-normal whitespace-pre-wrap text-red-500" role="alert">
				{controller.errorMessage}
			</p>
			<button
				type="button"
				class="mt-2 inline-flex items-center rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors duration-150 ease-out hover:bg-background-inset"
				onclick={controller.retryRuntime}
			>
				Retry runtime
			</button>
		</div>
	{/if}
</section>
