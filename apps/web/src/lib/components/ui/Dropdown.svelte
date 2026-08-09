<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { AppChevronRightIcon } from '$lib/components/icons';
	import { resolve } from '$app/paths';
	import { type Component } from 'svelte';
	import { motionDuration, motionDistance } from '$lib/utils/motion';

	export type DropdownItem<T = string> = {
		label: string;
		value: T;
		active?: boolean;
		href?: string;
		icon?: Component<{ size?: number; class?: string }>;
		description?: string;
	};

	let {
		items = [],
		onItemClick,
		class: className,
		...restProps
	}: {
		items?: DropdownItem[];
		onItemClick?: (value: string) => void;
		class?: string;
	} = $props();

	let isOpen = $state(false);
	let containerEl = $state<HTMLElement>();
	let triggerEl = $state<HTMLElement>();
	let focusedIndex = $state(0);
	let itemRefEls: (HTMLElement | undefined)[] = $state([]);
	let clickRatioX = $state(0.5);

	function open(initialIndex?: number) {
		isOpen = true;
		const activeIdx = items.findIndex((item) => item.active);
		focusedIndex = initialIndex ?? (activeIdx >= 0 ? activeIdx : 0);
	}

	function openFromEvent(e: MouseEvent | KeyboardEvent, initialIndex?: number) {
		if (e instanceof MouseEvent && triggerEl) {
			const rect = triggerEl.getBoundingClientRect();
			clickRatioX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		} else {
			clickRatioX = 0.5;
		}
		open(initialIndex);
	}

	function close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
		isOpen = false;
		focusedIndex = 0;
		if (restoreFocus) {
			triggerEl?.focus();
		}
	}

	function toggle(e: MouseEvent) {
		if (isOpen) {
			close();
		} else {
			openFromEvent(e);
		}
	}

	function handleTriggerKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			openFromEvent(e, e.key === 'ArrowUp' ? Math.max(0, items.length - 1) : undefined);
		}
	}

	function handleItemClick(value: string) {
		onItemClick?.(value);
		close();
		return false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (!isOpen) return;
		if (e.key !== 'Escape' && items.length === 0) return;

		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				close();
				break;
			case 'ArrowDown':
				e.preventDefault();
				focusedIndex = (focusedIndex + 1) % items.length;
				itemRefEls[focusedIndex]?.focus();
				break;
			case 'ArrowUp':
				e.preventDefault();
				focusedIndex = (focusedIndex - 1 + items.length) % items.length;
				itemRefEls[focusedIndex]?.focus();
				break;
			case 'Home':
				e.preventDefault();
				focusedIndex = 0;
				itemRefEls[focusedIndex]?.focus();
				break;
			case 'End':
				e.preventDefault();
				focusedIndex = Math.max(0, items.length - 1);
				itemRefEls[focusedIndex]?.focus();
				break;
			case 'Enter':
			case ' ': {
				e.preventDefault();
				itemRefEls[focusedIndex]?.click();
				break;
			}
		}
	}

	function handleFocusOut(e: FocusEvent) {
		if (!isOpen || !containerEl) return;
		const nextTarget = e.relatedTarget;
		if (!(nextTarget instanceof Node) || !containerEl.contains(nextTarget)) {
			close({ restoreFocus: false });
		}
	}

	$effect(() => {
		if (!isOpen) return;

		function handleClickOut(e: MouseEvent) {
			if (containerEl && !containerEl.contains(e.target as Node) && e.target !== triggerEl) {
				isOpen = false;
			}
		}

		requestAnimationFrame(() => {
			document.addEventListener('click', handleClickOut);
		});

		return () => {
			document.removeEventListener('click', handleClickOut);
		};
	});

	const activeSection = $derived.by(() => {
		const active = items.find((item) => item.active);
		if (active) return active;
		if (items[0]) return items[0];
		return undefined;
	});

	$effect(() => {
		if (isOpen) {
			requestAnimationFrame(() => {
				itemRefEls[focusedIndex]?.focus();
			});
		}
	});

	function popTransition(_node: Element) {
		const originX = String(clickRatioX * 100);
		const startScale = motionDistance(0.05);
		return {
			duration: motionDuration(100),
			css: (t: number) => {
				const s = String(1 - startScale * (1 - t));
				return (
					'opacity: ' +
					String(t) +
					'; transform: scale(' +
					s +
					'); transform-origin: ' +
					originX +
					'% top;'
				);
			}
		};
	}
</script>

<div
	bind:this={containerEl}
	class={cn(
		'inset-shadow relative inline-block rounded-sm bg-background-inset',
		isOpen && 'z-50',
		className
	)}
	{...restProps}
	{onkeydown}
	onfocusout={handleFocusOut}
>
	<div
		bind:this={triggerEl}
		role="button"
		tabindex="0"
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		onclick={toggle}
		onkeydown={handleTriggerKeydown}
		class="focus-ring relative inline-flex w-full cursor-default items-center justify-between gap-1 rounded-sm px-3 py-1.5 text-sm font-medium text-foreground-muted/70 transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
	>
		<span class="flex items-center gap-1.5 select-none">
			{#if activeSection?.icon}
				<activeSection.icon size={16} />
			{/if}
			{activeSection?.label}
		</span>
		<AppChevronRightIcon class="my-1 size-4 rotate-90" />
	</div>

	{#if isOpen}
		<div
			class="absolute top-full left-0 z-50 mt-1 flex min-w-full flex-col gap-1 rounded-sm bg-background p-1 shadow-2xl card"
			role="listbox"
			transition:popTransition
		>
			{#each items as item, i (item.value)}
				{@const itemClass = cn(
					'focus-ring flex w-full items-start gap-3 rounded-xs px-3 py-1.5 text-left text-sm transition-[color,background-color,box-shadow] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent motion-reduce:transition-none',
					item.active
						? 'bg-accent/10 text-accent'
						: 'text-foreground-muted hover:bg-background-muted hover:text-foreground'
				)}
				{#if item.href}
					<a
						bind:this={itemRefEls[i]}
						// @ts-expect-error
						href={resolve(item.href)}
						role="option"
						aria-selected={item.active}
						tabindex={focusedIndex === i ? 0 : -1}
						onclick={() => {
							handleItemClick(item.value);
						}}
						class={itemClass}
					>
						<!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
						{@render dropdownItem(item)}
					</a>
				{:else}
					<button
						bind:this={itemRefEls[i]}
						type="button"
						role="option"
						aria-selected={item.active}
						tabindex={focusedIndex === i ? 0 : -1}
						onclick={() => {
							handleItemClick(item.value);
						}}
						class={itemClass}
					>
						<!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
						{@render dropdownItem(item)}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>

{#snippet dropdownItem(item: DropdownItem)}
	{#if item.icon}
		<item.icon size={16} class="my-0.5 shrink-0" />
	{/if}
	<div class="min-w-0 flex-1">
		<span class="mb-0.5 line-clamp-1 font-medium">{item.label}</span>
		{#if item.description}
			<div class="leading-[1em] text-pretty">
				<span class="text-xs text-foreground-muted">{item.description}</span>
			</div>
		{/if}
	</div>
{/snippet}
