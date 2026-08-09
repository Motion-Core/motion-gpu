<script lang="ts" module>
	let activeTooltipCount = 0;
	let skipDelayUntil = 0;
</script>

<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type TriggerDescription = { describedBy: string | undefined };

	type Props = {
		children?: Snippet<[TriggerDescription]>;
		tooltip?: Snippet;
		content?: string;
		side?: Side;
		delay?: number;
		closeDelay?: number;
		switchGrace?: number;
		class?: string;
		tooltipClass?: string;
	};

	let {
		children,
		tooltip,
		content = '',
		side = 'top',
		delay = 600,
		closeDelay = 0,
		switchGrace = 200,
		class: className,
		tooltipClass
	}: Props = $props();

	let isOpen = $state(false);
	let isPointerInside = $state(false);
	let triggerRef: HTMLDivElement | undefined;
	let isTooltipEnabled = $state(true);
	let prefersReducedMotion = $state(false);
	let arrowX = $state('50%');
	let arrowY = $state('50%');

	const componentId = $props.id();
	const tooltipId = `${componentId}-tooltip`;
	const popupId = `${tooltipId}-popup`;
	const describedBy = $derived(content ? tooltipId : isOpen ? popupId : undefined);
	const arrowClass = $derived(
		{
			top: 'top-[calc(100%-1px)] -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-foreground',
			right:
				'right-[calc(100%-1px)] -translate-y-1/2 border-y-[5px] border-r-[5px] border-y-transparent border-r-foreground',
			bottom:
				'bottom-[calc(100%-1px)] -translate-x-1/2 border-x-[5px] border-b-[5px] border-x-transparent border-b-foreground',
			left: 'left-[calc(100%-1px)] -translate-y-1/2 border-y-[5px] border-l-[5px] border-y-transparent border-l-foreground'
		}[side]
	);
	const tooltipTransition = $derived.by(() => {
		if (prefersReducedMotion) return { duration: 0, x: 0, y: 0 };

		const distance = 5;
		const offset = {
			top: { x: 0, y: distance },
			right: { x: -distance, y: 0 },
			bottom: { x: 0, y: -distance },
			left: { x: distance, y: 0 }
		}[side];

		return { ...offset, duration: 150, easing: cubicOut };
	});

	let openTimeout: ReturnType<typeof setTimeout> | undefined;
	let closeTimeout: ReturnType<typeof setTimeout> | undefined;

	function clearOpenTimeout() {
		if (!openTimeout) return;
		clearTimeout(openTimeout);
		openTimeout = undefined;
	}

	function clearCloseTimeout() {
		if (!closeTimeout) return;
		clearTimeout(closeTimeout);
		closeTimeout = undefined;
	}

	function openNow() {
		if (isOpen) return;
		isOpen = true;
		activeTooltipCount += 1;
	}

	function closeNow() {
		if (!isOpen) return;
		isOpen = false;
		activeTooltipCount = Math.max(0, activeTooltipCount - 1);
		if (activeTooltipCount === 0) skipDelayUntil = Date.now() + switchGrace;
	}

	function scheduleOpen() {
		if (!isTooltipEnabled) return;
		clearCloseTimeout();
		clearOpenTimeout();

		const wait = activeTooltipCount > 0 || Date.now() < skipDelayUntil ? 0 : delay;
		if (wait === 0) {
			openNow();
			return;
		}

		openTimeout = setTimeout(() => {
			openNow();
			openTimeout = undefined;
		}, wait);
	}

	function scheduleClose() {
		clearOpenTimeout();
		clearCloseTimeout();
		if (closeDelay === 0) {
			closeNow();
			return;
		}

		closeTimeout = setTimeout(
			() => {
				if (!isPointerInside) closeNow();
				closeTimeout = undefined;
			},
			Math.max(0, closeDelay)
		);
	}

	function attachTrigger(node: HTMLDivElement) {
		triggerRef = node;
		return () => {
			if (triggerRef === node) triggerRef = undefined;
		};
	}

	function positionTooltip(node: HTMLDivElement) {
		if (!triggerRef) return;

		const triggerRect = triggerRef.getBoundingClientRect();
		const tooltipWidth = node.offsetWidth;
		const tooltipHeight = node.offsetHeight;
		const offset = 8;
		const viewportPadding = 8;
		let top: number;
		let left: number;

		switch (side) {
			case 'right':
				top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;
				left = triggerRect.right + offset;
				break;
			case 'bottom':
				top = triggerRect.bottom + offset;
				left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
				break;
			case 'left':
				top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;
				left = triggerRect.left - tooltipWidth - offset;
				break;
			default:
				top = triggerRect.top - tooltipHeight - offset;
				left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
		}

		const maxTop = window.innerHeight - tooltipHeight - viewportPadding;
		const maxLeft = window.innerWidth - tooltipWidth - viewportPadding;
		top = Math.min(Math.max(viewportPadding, top), Math.max(viewportPadding, maxTop));
		left = Math.min(Math.max(viewportPadding, left), Math.max(viewportPadding, maxLeft));

		const arrowPadding = 8;
		if (side === 'top' || side === 'bottom') {
			const triggerCenter = triggerRect.left + triggerRect.width / 2;
			arrowX = `${Math.min(Math.max(triggerCenter - left, arrowPadding), tooltipWidth - arrowPadding).toString()}px`;
		} else {
			const triggerCenter = triggerRect.top + triggerRect.height / 2;
			arrowY = `${Math.min(Math.max(triggerCenter - top, arrowPadding), tooltipHeight - arrowPadding).toString()}px`;
		}

		node.style.top = `${Math.round(top).toString()}px`;
		node.style.left = `${Math.round(left).toString()}px`;
	}

	function attachTooltip(node: HTMLDivElement) {
		document.body.appendChild(node);
		const updatePosition = () => {
			positionTooltip(node);
		};
		const animationFrame = requestAnimationFrame(updatePosition);
		const resizeObserver = new ResizeObserver(updatePosition);

		resizeObserver.observe(node);
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);

		return () => {
			cancelAnimationFrame(animationFrame);
			resizeObserver.disconnect();
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
			node.remove();
		};
	}

	onMount(() => {
		const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
		const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateAvailability = () => {
			isTooltipEnabled = mediaQuery.matches;
			if (!isTooltipEnabled) {
				clearOpenTimeout();
				clearCloseTimeout();
				closeNow();
			}
		};
		const updateMotionPreference = () => {
			prefersReducedMotion = reducedMotionQuery.matches;
		};

		updateAvailability();
		updateMotionPreference();
		mediaQuery.addEventListener('change', updateAvailability);
		reducedMotionQuery.addEventListener('change', updateMotionPreference);

		return () => {
			mediaQuery.removeEventListener('change', updateAvailability);
			reducedMotionQuery.removeEventListener('change', updateMotionPreference);
			clearOpenTimeout();
			clearCloseTimeout();
			if (isOpen) activeTooltipCount = Math.max(0, activeTooltipCount - 1);
		};
	});
</script>

<div
	{@attach attachTrigger}
	class={cn('relative inline-flex', className)}
	role="presentation"
	onpointerenter={() => {
		isPointerInside = true;
		scheduleOpen();
	}}
	onpointerleave={() => {
		isPointerInside = false;
		scheduleClose();
	}}
	onfocusin={scheduleOpen}
	onfocusout={scheduleClose}
>
	{@render children?.({ describedBy })}

	{#if content}
		<span id={tooltipId} class="sr-only">{content}</span>
	{/if}

	{#if isTooltipEnabled && isOpen && (content || tooltip)}
		<div
			{@attach attachTooltip}
			id={popupId}
			role="tooltip"
			class={cn(
				'pointer-events-none fixed z-200 rounded-xs bg-foreground px-2 py-1 text-xs leading-none font-medium whitespace-nowrap text-background/80 shadow-lg',
				tooltipClass
			)}
			transition:fly={tooltipTransition}
		>
			{#if tooltip}
				{@render tooltip()}
			{:else}
				{content}
			{/if}
			<span
				class={cn('absolute h-0 w-0', arrowClass)}
				style:left={side === 'top' || side === 'bottom' ? arrowX : undefined}
				style:top={side === 'left' || side === 'right' ? arrowY : undefined}
			></span>
		</div>
	{/if}
</div>
