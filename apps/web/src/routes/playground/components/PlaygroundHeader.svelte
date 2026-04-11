<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeft from 'carbon-icons-svelte/lib/ArrowLeft.svelte';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { brandingConfig } from '$lib/config/branding';
	import PlaygroundFrameworkSwitch from './PlaygroundFrameworkSwitch.svelte';

	type DemoSelectOption = {
		value: string;
		label: string;
	};

	type Props = {
		activeDemoId: string;
		activeFramework: string;
		demoOptions: DemoSelectOption[];
		onSelectDemo: (demoId: string) => void;
		onSelectFramework: (framework: string) => void;
	};

	let { activeDemoId, activeFramework, demoOptions, onSelectDemo, onSelectFramework }: Props =
		$props();

	const cycleDemo = (offset: 1 | -1) => {
		if (demoOptions.length < 2) return;
		const currentIndex = demoOptions.findIndex((option) => option.value === activeDemoId);
		const safeIndex = currentIndex >= 0 ? currentIndex : 0;
		const nextIndex = (safeIndex + offset + demoOptions.length) % demoOptions.length;
		const nextDemo = demoOptions[nextIndex];
		if (!nextDemo) return;
		onSelectDemo(nextDemo.value);
	};
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
	<a
		href={resolve('/')}
		class="inline-flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-sm tracking-tight text-foreground transition-colors duration-150 ease-out hover:text-foreground"
	>
		<span
			class="inline-flex shrink-0 items-center text-accent [&>svg]:size-4 [&>svg]:fill-current"
			aria-hidden="true"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html brandingConfig.logoRaw}
		</span>
		<span class="truncate font-medium tracking-tight text-foreground">{brandingConfig.name}</span>
	</a>

	<div class="order-3 flex w-full justify-center sm:order-2 sm:w-auto">
		<div class="inset-shadow inline-flex items-center rounded-sm bg-background-inset p-0.5">
			<button
				type="button"
				class="inline-flex h-7 w-7 items-center justify-center rounded-[3px] text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
				aria-label="Previous demo"
				onclick={() => cycleDemo(-1)}
				disabled={demoOptions.length < 2}
			>
				<ArrowLeft size={16} />
			</button>

			<label class="sr-only" for="playground-header-demo-select">Choose demo</label>
			<Select
				id="playground-header-demo-select"
				class="w-[clamp(10rem,28vw,18rem)]"
				triggerClass="h-7 bg-transparent hover:bg-background-muted"
				menuClass="min-w-[11rem]"
				value={activeDemoId}
				options={demoOptions}
				onValueChange={onSelectDemo}
				ariaLabel="Choose demo"
			/>

			<button
				type="button"
				class="inline-flex h-7 w-7 items-center justify-center rounded-[3px] text-foreground-muted transition-colors duration-150 ease-out hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
				aria-label="Next demo"
				onclick={() => cycleDemo(1)}
				disabled={demoOptions.length < 2}
			>
				<ArrowRight size={16} />
			</button>
		</div>
	</div>

	<div class="order-2 inline-flex items-center gap-1 sm:order-3">
		<PlaygroundFrameworkSwitch {activeFramework} {onSelectFramework} />
		<ThemeToggle />
	</div>
</div>
