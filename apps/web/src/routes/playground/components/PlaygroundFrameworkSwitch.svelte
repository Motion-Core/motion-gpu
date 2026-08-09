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

	function selectAndFocus(index: number, group: HTMLElement | null) {
		const option = frameworkOptions[index];
		if (!option) return;
		onSelectFramework(option.value);
		group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
	}

	function handleKeydown(event: KeyboardEvent, index: number) {
		const lastIndex = frameworkOptions.length - 1;
		let nextIndex: number;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault();
				nextIndex = index === lastIndex ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				nextIndex = index === 0 ? lastIndex : index - 1;
				break;
			case 'Home':
				event.preventDefault();
				nextIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				nextIndex = lastIndex;
				break;
			default:
				return;
		}

		const currentTarget = event.currentTarget;
		selectAndFocus(
			nextIndex,
			currentTarget instanceof HTMLElement ? currentTarget.parentElement : null
		);
	}
</script>

<div
	class="inset-shadow inline-flex items-center gap-1 rounded-sm bg-background-inset p-1"
	role="radiogroup"
	aria-label="Framework"
>
	{#each frameworkOptions as framework, index (framework.value)}
		<button
			type="button"
			role="radio"
			tabindex={framework.value === activeFramework ? 0 : -1}
			class={cn(
				'focus-ring focus-outline inline-flex h-5 w-5 items-center justify-center rounded-[6px] transition-[color,box-shadow] duration-150 ease-out outline-none motion-reduce:transition-none',
				framework.value === activeFramework
					? 'bg-background text-foreground card'
					: 'text-foreground-muted hover:text-foreground'
			)}
			aria-label={`Switch framework to ${framework.label}`}
			aria-checked={framework.value === activeFramework}
			onclick={() => onSelectFramework(framework.value)}
			onkeydown={(event) => {
				handleKeydown(event, index);
			}}
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
