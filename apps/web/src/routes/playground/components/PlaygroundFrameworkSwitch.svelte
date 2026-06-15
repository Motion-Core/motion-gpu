<script lang="ts">
	import {
		AppFrameworkReactIcon,
		AppFrameworkSvelteIcon,
		AppFrameworkVueIcon
	} from '$lib/components/icons';
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
					? 'bg-background text-foreground card'
					: 'text-foreground-muted hover:text-foreground'
			)}
			aria-label={`Switch framework to ${framework.label}`}
			aria-pressed={framework.value === activeFramework}
			onclick={() => onSelectFramework(framework.value)}
		>
			{#if framework.value === 'svelte'}
				<AppFrameworkSvelteIcon size={16} />
			{:else if framework.value === 'react'}
				<AppFrameworkReactIcon size={16} />
			{:else}
				<AppFrameworkVueIcon size={16} />
			{/if}
		</button>
	{/each}
</div>
