<script lang="ts">
	import { resolve } from '$app/paths';
	import Return from 'carbon-icons-svelte/lib/Return.svelte';
	import OpenPanelFilledLeft from 'carbon-icons-svelte/lib/OpenPanelFilledLeft.svelte';
	import OpenPanelLeft from 'carbon-icons-svelte/lib/OpenPanelLeft.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	type DemoSelectOption = {
		value: string;
		label: string;
	};

	let {
		activeDemoId,
		demoOptions,
		isTreeVisible,
		onSelectDemo,
		onToggleTree
	}: {
		activeDemoId: string;
		demoOptions: DemoSelectOption[];
		isTreeVisible: boolean;
		onSelectDemo: (demoId: string) => void;
		onToggleTree: () => void;
	} = $props();
</script>

<div
	class="flex h-9 items-center justify-between border-b border-border bg-background px-2 sm:px-3"
>
	<div
		class="inline-flex items-center gap-1 py-2 text-sm tracking-tight text-foreground transition-colors hover:text-foreground"
	>
		<a
			href={resolve('/' as const)}
			class="inline-flex items-center gap-1 py-1.5 text-xs font-medium tracking-tight text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground"
			aria-label="Back to Home"
			title="Back to Home"
		>
			<Return size={16} />
			Return to the homepage
		</a>
	</div>
	<div class="flex items-center gap-4">
		<div>
			<label class="sr-only" for="playground-demo-select">Choose demo</label>
			<Select
				id="playground-demo-select"
				class="w-48"
				triggerClass="w-48"
				value={activeDemoId}
				options={demoOptions}
				onValueChange={onSelectDemo}
				ariaLabel="Choose demo"
			/>
		</div>
		<button
			type="button"
			class={`layout-toggle ${isTreeVisible ? 'layout-toggle--active' : ''}`}
			onclick={onToggleTree}
			aria-label="Toggle file tree"
			title="Toggle file tree"
		>
			{#if isTreeVisible}
				<OpenPanelFilledLeft size={16} />
			{:else}
				<OpenPanelLeft size={16} />
			{/if}
		</button>
	</div>
</div>
