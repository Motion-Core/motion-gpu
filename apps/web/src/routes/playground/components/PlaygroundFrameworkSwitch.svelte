<script lang="ts">
	import LogoReact from 'carbon-icons-svelte/lib/LogoReact.svelte';
	import LogoSvelte from 'carbon-icons-svelte/lib/LogoSvelte.svelte';
	import LogoVue from 'carbon-icons-svelte/lib/LogoVue.svelte';
	import { cn } from '$lib/utils/cn';

	type Framework = 'svelte' | 'react' | 'vue';

	type Props = {
		activeFramework: string;
		onSelectFramework: (framework: string) => void;
	};

	let { activeFramework, onSelectFramework }: Props = $props();

	const frameworkOptions: Array<{ value: Framework; label: string }> = [
		{ value: 'svelte', label: 'Svelte' },
		{ value: 'react', label: 'React' },
		{ value: 'vue', label: 'Vue' }
	];
</script>

<div
	class="inset-shadow inline-flex items-center gap-1 rounded-sm bg-background-inset p-1"
	role="group"
>
	{#each frameworkOptions as framework (framework.value)}
		<button
			type="button"
			class={cn(
				'inline-flex h-5 w-5 items-center justify-center rounded-[6px] transition-colors duration-150 ease-out',
				framework.value === activeFramework
					? 'card bg-background text-foreground'
					: 'text-foreground-muted hover:text-foreground'
			)}
			aria-label={`Switch framework to ${framework.label}`}
			aria-pressed={framework.value === activeFramework}
			onclick={() => onSelectFramework(framework.value)}
		>
			{#if framework.value === 'svelte'}
				<LogoSvelte size={16} />
			{:else if framework.value === 'react'}
				<LogoReact size={16} />
			{:else}
				<LogoVue size={16} />
			{/if}
		</button>
	{/each}
</div>
