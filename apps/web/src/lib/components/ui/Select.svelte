<script lang="ts">
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import ChevronDown from 'carbon-icons-svelte/lib/ChevronDown.svelte';
	import { cn } from '$lib/utils/cn';

	export type SelectOption = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	interface Props {
		id?: string;
		value: string;
		options: SelectOption[];
		disabled?: boolean;
		class?: string;
		triggerClass?: string;
		menuClass?: string;
		placeholder?: string;
		ariaLabel?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		id,
		value,
		options,
		disabled = false,
		class: className = '',
		triggerClass = '',
		menuClass = '',
		placeholder = 'Select an option',
		ariaLabel,
		onValueChange
	}: Props = $props();

	let root: HTMLDivElement | null = null;
	let trigger: HTMLButtonElement | null = null;
	let isOpen = $state(false);
	let highlightedIndex = $state(-1);

	const listboxId = $derived(id ? `${id}-listbox` : undefined);
	const selectedOption = $derived(options.find((option) => option.value === value));
	const selectedLabel = $derived(selectedOption?.label ?? placeholder);

	const getFirstEnabledIndex = () => options.findIndex((option) => !option.disabled);
	const getLastEnabledIndex = () => options.findLastIndex((option) => !option.disabled);
	const getSelectedEnabledIndex = () =>
		options.findIndex((option) => option.value === value && !option.disabled);
	const getInitialHighlightIndex = () => {
		const selectedIndex = getSelectedEnabledIndex();
		return selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex();
	};

	const closeMenu = (focusTrigger = false) => {
		isOpen = false;
		highlightedIndex = -1;
		if (focusTrigger) {
			trigger?.focus();
		}
	};

	const openMenu = () => {
		if (disabled || options.length === 0) return;
		isOpen = true;
		highlightedIndex = getInitialHighlightIndex();
	};

	const toggleMenu = () => {
		if (isOpen) {
			closeMenu();
			return;
		}
		openMenu();
	};

	const selectByIndex = (index: number) => {
		const option = options[index];
		if (!option || option.disabled) return;
		if (option.value !== value) {
			onValueChange?.(option.value);
		}
		closeMenu(true);
	};

	const moveHighlight = (step: 1 | -1) => {
		if (options.length === 0) return;
		let index = highlightedIndex;
		if (index < 0) index = getInitialHighlightIndex();
		if (index < 0) return;

		for (let attempts = 0; attempts < options.length; attempts += 1) {
			index = (index + step + options.length) % options.length;
			if (!options[index]?.disabled) {
				highlightedIndex = index;
				return;
			}
		}
	};

	const handleTriggerKeydown = (event: KeyboardEvent) => {
		if (disabled) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (!isOpen) {
					openMenu();
					return;
				}
				moveHighlight(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (!isOpen) {
					openMenu();
					return;
				}
				moveHighlight(-1);
				break;
			case 'Home':
				if (!isOpen) return;
				event.preventDefault();
				highlightedIndex = getFirstEnabledIndex();
				break;
			case 'End':
				if (!isOpen) return;
				event.preventDefault();
				highlightedIndex = getLastEnabledIndex();
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (!isOpen) {
					openMenu();
					return;
				}
				if (highlightedIndex >= 0) {
					selectByIndex(highlightedIndex);
				}
				break;
			case 'Escape':
				if (!isOpen) return;
				event.preventDefault();
				closeMenu(true);
				break;
		}
	};

	const handleFocusOut = () => {
		if (typeof window === 'undefined') return;
		requestAnimationFrame(() => {
			if (!isOpen || !root) return;
			if (!root.contains(document.activeElement)) {
				closeMenu();
			}
		});
	};

	$effect(() => {
		if (!isOpen || typeof window === 'undefined') return;

		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && root?.contains(target)) return;
			closeMenu();
		};

		window.addEventListener('pointerdown', onPointerDown);
		return () => window.removeEventListener('pointerdown', onPointerDown);
	});

	$effect(() => {
		if (!isOpen || highlightedIndex < 0) return;
		void tick().then(() => {
			const option = root?.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`);
			option?.scrollIntoView({ block: 'nearest' });
		});
	});
</script>

<div class={cn('relative inline-flex', className)} bind:this={root} onfocusout={handleFocusOut}>
	<button
		bind:this={trigger}
		type="button"
		{id}
		class={cn(
			'inline-flex h-7 w-full items-center justify-between gap-1.5 rounded border border-border bg-background px-2 text-xs text-foreground transition-colors duration-150 ease-out outline-none hover:bg-background-inset focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-50',
			triggerClass
		)}
		{disabled}
		aria-label={ariaLabel}
		aria-expanded={isOpen}
		aria-haspopup="listbox"
		aria-controls={listboxId}
		onclick={toggleMenu}
		onkeydown={handleTriggerKeydown}
	>
		<span class="truncate">{selectedLabel}</span>
		<ChevronDown
			size={16}
			class={cn(
				'shrink-0 text-foreground-muted transition-transform duration-150',
				isOpen && 'rotate-180'
			)}
		/>
	</button>

	{#if isOpen}
		<div
			class={cn(
				'absolute top-[calc(100%+4px)] left-0 z-50 min-w-full overflow-hidden rounded border border-border bg-background shadow-lg',
				menuClass
			)}
			transition:scale={{ start: 0.98, duration: 130, easing: cubicOut }}
		>
			<ul
				id={listboxId}
				role="listbox"
				aria-labelledby={id}
				tabindex="-1"
				class="max-h-56 space-y-1 overflow-auto"
			>
				{#each options as option, index (option.value)}
					<button
						type="button"
						role="option"
						aria-selected={option.value === value}
						aria-disabled={option.disabled || undefined}
						data-option-index={index}
						class={cn(
							'flex w-full cursor-default items-center px-2 py-1.5 text-left text-xs font-normal transition-colors duration-150 ease-out',
							option.disabled
								? 'cursor-not-allowed text-foreground/40'
								: 'text-foreground-muted hover:bg-background-inset hover:text-foreground',
							index === highlightedIndex &&
								!option.disabled &&
								'bg-background-inset text-foreground',
							option.value === value && !option.disabled && 'font-medium text-foreground'
						)}
						onmouseenter={() => (highlightedIndex = index)}
						onclick={() => selectByIndex(index)}
					>
						{option.label}
					</button>
				{/each}
			</ul>
		</div>
	{/if}
</div>
