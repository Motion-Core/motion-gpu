<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';

	import type { PlaygroundController } from '../playground-controller.svelte';
	type DemoSelectOption = {
		value: string;
		label: string;
	};

	let {
		controller,
		activeDemoId,
		activeFramework,
		demoOptions,
		frameworkOptions,
		onSelectDemo,
		onSelectFramework,
		onPreviewFrameChange
	}: {
		controller: PlaygroundController;
		activeDemoId: string;
		activeFramework: string;
		demoOptions: DemoSelectOption[];
		frameworkOptions: DemoSelectOption[];
		onSelectDemo: (demoId: string) => void;
		onSelectFramework: (framework: string) => void;
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

<section class="inset-shadow flex min-h-0 flex-col overflow-hidden rounded-md bg-background p-px">
	<div class="relative min-h-0 flex-1 overflow-hidden rounded-[calc(var(--radius-base)*2.75)]">
		<div class="absolute top-2 right-2 z-10 flex gap-2">
			<label class="sr-only" for="playground-preview-framework-select">Choose framework</label>
			<Select
				id="playground-preview-framework-select"
				class="w-24"
				triggerClass="w-24"
				value={activeFramework}
				options={frameworkOptions}
				onValueChange={onSelectFramework}
				ariaLabel="Choose framework"
			/>
			<label class="sr-only" for="playground-preview-demo-select">Choose demo</label>
			<Select
				id="playground-preview-demo-select"
				class="w-44"
				triggerClass="w-44"
				value={activeDemoId}
				options={demoOptions}
				onValueChange={onSelectDemo}
				ariaLabel="Choose demo"
			/>
		</div>
		{#key controller.previewFrameKey}
			<iframe
				use:registerPreviewFrame
				title="Playground preview"
				srcdoc={controller.previewSrcdoc}
				class="h-full w-full overflow-hidden rounded-[calc(var(--radius-base)*2.5)]"
				loading="eager"
				sandbox="allow-scripts allow-forms allow-modals allow-popups"
				referrerpolicy="no-referrer"
			></iframe>
		{/key}
	</div>

	{#if controller.errorMessage}
		<div class="px-3 py-2">
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
