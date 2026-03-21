<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	type ScrollMode = 'vertical' | 'horizontal' | 'both';
	type Axis = 'vertical' | 'horizontal';

	type Props = {
		class?: string;
		id?: string;
		children?: Snippet;
		style?: string;
		viewportClass?: string;
		viewportStyle?: string;
		mode?: ScrollMode;
	};

	const MIN_THUMB_SIZE = 20;
	const SCROLL_TIMEOUT_MS = 600;
	const SCROLLBAR_THICKNESS = 10;

	let {
		class: className,
		id,
		children,
		style,
		viewportClass,
		viewportStyle,
		mode = 'vertical'
	}: Props = $props();
	const viewportId = $derived(id ?? undefined);

	let viewport = $state<HTMLDivElement | null>(null);
	let isDragging = $state(false);
	let dragAxis = $state<Axis | null>(null);
	let startX = 0;
	let startY = 0;
	let startScrollLeft = 0;
	let startScrollTop = 0;

	let verticalThumbSize = $state(0);
	let verticalThumbOffset = $state(0);
	let verticalVisible = $state(false);

	let horizontalThumbSize = $state(0);
	let horizontalThumbOffset = $state(0);
	let horizontalVisible = $state(false);

	let isScrolling = $state(false);
	let isHoveringVerticalTrack = $state(false);
	let isHoveringHorizontalTrack = $state(false);
	let scrollTimeout: ReturnType<typeof setTimeout> | undefined;

	const verticalEnabled = $derived(mode === 'vertical' || mode === 'both');
	const horizontalEnabled = $derived(mode === 'horizontal' || mode === 'both');

	const viewportOverflowClass = $derived.by(() => {
		if (mode === 'horizontal') return 'overflow-x-auto overflow-y-hidden';
		if (mode === 'both') return 'overflow-auto';
		return 'overflow-x-hidden overflow-y-auto';
	});

	const showVerticalTrack = $derived(verticalEnabled && verticalVisible);
	const showHorizontalTrack = $derived(horizontalEnabled && horizontalVisible);

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, value));
	}

	function updateThumbs(target: HTMLDivElement | null = viewport) {
		if (!target) return;

		const { clientHeight, clientWidth, scrollHeight, scrollWidth, scrollLeft, scrollTop } = target;

		const nextVerticalVisible = verticalEnabled && scrollHeight > clientHeight + 1;
		let nextVerticalThumbSize = 0;
		let nextVerticalThumbOffset = 0;

		if (nextVerticalVisible) {
			const heightRatio = clientHeight / scrollHeight;
			nextVerticalThumbSize = Math.max(MIN_THUMB_SIZE, clientHeight * heightRatio);

			const maxScroll = Math.max(0, scrollHeight - clientHeight);
			const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
			const maxThumbOffset = Math.max(0, clientHeight - nextVerticalThumbSize);
			nextVerticalThumbOffset = scrollRatio * maxThumbOffset;
		}

		verticalVisible = nextVerticalVisible;
		verticalThumbSize = nextVerticalThumbSize;
		verticalThumbOffset = nextVerticalThumbOffset;

		const nextHorizontalVisible = horizontalEnabled && scrollWidth > clientWidth + 1;
		let nextHorizontalThumbSize = 0;
		let nextHorizontalThumbOffset = 0;

		if (nextHorizontalVisible) {
			const widthRatio = clientWidth / scrollWidth;
			nextHorizontalThumbSize = Math.max(MIN_THUMB_SIZE, clientWidth * widthRatio);

			const maxScroll = Math.max(0, scrollWidth - clientWidth);
			const scrollRatio = maxScroll > 0 ? scrollLeft / maxScroll : 0;
			const maxThumbOffset = Math.max(0, clientWidth - nextHorizontalThumbSize);
			nextHorizontalThumbOffset = scrollRatio * maxThumbOffset;
		}

		horizontalVisible = nextHorizontalVisible;
		horizontalThumbSize = nextHorizontalThumbSize;
		horizontalThumbOffset = nextHorizontalThumbOffset;
	}

	function handleScroll() {
		requestAnimationFrame(() => updateThumbs());
		isScrolling = true;
		clearTimeout(scrollTimeout);
		scrollTimeout = setTimeout(() => {
			isScrolling = false;
		}, SCROLL_TIMEOUT_MS);
	}

	function onDragStart(event: MouseEvent, axis: Axis) {
		if (!viewport) return;
		event.preventDefault();
		event.stopPropagation();

		isDragging = true;
		dragAxis = axis;
		startX = event.clientX;
		startY = event.clientY;
		startScrollLeft = viewport.scrollLeft;
		startScrollTop = viewport.scrollTop;

		document.addEventListener('mousemove', onDragMove);
		document.addEventListener('mouseup', onDragEnd);
		document.body.style.userSelect = 'none';
	}

	function onDragMove(event: MouseEvent) {
		if (!isDragging || !viewport || !dragAxis) return;

		if (dragAxis === 'vertical') {
			const deltaY = event.clientY - startY;
			const maxThumbOffset = Math.max(0, viewport.clientHeight - verticalThumbSize);
			const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

			if (maxThumbOffset === 0) return;

			const scrollAmount = (deltaY / maxThumbOffset) * maxScroll;
			viewport.scrollTop = clamp(startScrollTop + scrollAmount, 0, maxScroll);
			return;
		}

		const deltaX = event.clientX - startX;
		const maxThumbOffset = Math.max(0, viewport.clientWidth - horizontalThumbSize);
		const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);

		if (maxThumbOffset === 0) return;

		const scrollAmount = (deltaX / maxThumbOffset) * maxScroll;
		viewport.scrollLeft = clamp(startScrollLeft + scrollAmount, 0, maxScroll);
	}

	function onDragEnd() {
		isDragging = false;
		dragAxis = null;
		document.removeEventListener('mousemove', onDragMove);
		document.removeEventListener('mouseup', onDragEnd);
		document.body.style.userSelect = '';
	}

	function onThumbKeyDown(event: KeyboardEvent, axis: Axis) {
		if (!viewport) return;

		const lineStep = 40;
		if (axis === 'vertical') {
			const pageStep = Math.max(40, Math.floor(viewport.clientHeight * 0.9));
			const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

			switch (event.key) {
				case 'ArrowUp':
					event.preventDefault();
					viewport.scrollTop = clamp(viewport.scrollTop - lineStep, 0, maxScroll);
					break;
				case 'ArrowDown':
					event.preventDefault();
					viewport.scrollTop = clamp(viewport.scrollTop + lineStep, 0, maxScroll);
					break;
				case 'PageUp':
					event.preventDefault();
					viewport.scrollTop = clamp(viewport.scrollTop - pageStep, 0, maxScroll);
					break;
				case 'PageDown':
					event.preventDefault();
					viewport.scrollTop = clamp(viewport.scrollTop + pageStep, 0, maxScroll);
					break;
				case 'Home':
					event.preventDefault();
					viewport.scrollTop = 0;
					break;
				case 'End':
					event.preventDefault();
					viewport.scrollTop = maxScroll;
					break;
			}
			return;
		}

		const pageStep = Math.max(40, Math.floor(viewport.clientWidth * 0.9));
		const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				viewport.scrollLeft = clamp(viewport.scrollLeft - lineStep, 0, maxScroll);
				break;
			case 'ArrowRight':
				event.preventDefault();
				viewport.scrollLeft = clamp(viewport.scrollLeft + lineStep, 0, maxScroll);
				break;
			case 'PageUp':
				event.preventDefault();
				viewport.scrollLeft = clamp(viewport.scrollLeft - pageStep, 0, maxScroll);
				break;
			case 'PageDown':
				event.preventDefault();
				viewport.scrollLeft = clamp(viewport.scrollLeft + pageStep, 0, maxScroll);
				break;
			case 'Home':
				event.preventDefault();
				viewport.scrollLeft = 0;
				break;
			case 'End':
				event.preventDefault();
				viewport.scrollLeft = maxScroll;
				break;
		}
	}

	const viewportAttachment: Attachment<HTMLDivElement> = (node) => {
		void mode;
		viewport = node;
		updateThumbs(node);

		return () => {
			if (viewport === node) {
				viewport = null;
			}
		};
	};

	onMount(() => {
		updateThumbs();

		const observer = new ResizeObserver(() => {
			updateThumbs();
		});

		if (viewport) {
			observer.observe(viewport);
			Array.from(viewport.children).forEach((child) => {
				observer.observe(child);
			});
		}

		return () => {
			clearTimeout(scrollTimeout);
			document.removeEventListener('mousemove', onDragMove);
			document.removeEventListener('mouseup', onDragEnd);
			document.body.style.userSelect = '';
			observer.disconnect();
		};
	});
</script>

<div class={cn('relative flex flex-col overflow-hidden', className)} {style}>
	<div
		{@attach viewportAttachment}
		id={viewportId}
		class={cn('scrollbar-hide min-h-0 w-full flex-1', viewportOverflowClass, viewportClass)}
		style={viewportStyle}
		onscroll={handleScroll}
	>
		{@render children?.()}
	</div>

	{#if showVerticalTrack}
		<div
			class={cn(
				'absolute top-0 right-0 w-2.5 p-px transition-opacity duration-300',
				isScrolling || (isDragging && dragAxis === 'vertical') || isHoveringVerticalTrack
					? 'opacity-100'
					: 'opacity-0'
			)}
			style:bottom={showHorizontalTrack ? `${SCROLLBAR_THICKNESS}px` : '0px'}
			onmouseenter={() => (isHoveringVerticalTrack = true)}
			onmouseleave={() => (isHoveringVerticalTrack = false)}
			role="presentation"
		>
			<div
				role="scrollbar"
				aria-controls={viewportId}
				aria-orientation="vertical"
				aria-valuemin={0}
				aria-valuemax={Math.max(0, viewport ? viewport.scrollHeight - viewport.clientHeight : 0)}
				aria-valuenow={viewport?.scrollTop ?? 0}
				tabindex="0"
				class={cn(
					'relative rounded-full bg-foreground/10 transition-colors duration-150 hover:bg-foreground/30 active:bg-foreground/50',
					isDragging && dragAxis === 'vertical' && 'bg-foreground/50'
				)}
				style:height={`${verticalThumbSize}px`}
				style:transform={`translate3d(0, ${verticalThumbOffset}px, 0)`}
				onmousedown={(event) => onDragStart(event, 'vertical')}
				onkeydown={(event) => onThumbKeyDown(event, 'vertical')}
			></div>
		</div>
	{/if}

	{#if showHorizontalTrack}
		<div
			class={cn(
				'absolute bottom-0 left-0 h-2.5 p-px transition-opacity duration-300',
				isScrolling || (isDragging && dragAxis === 'horizontal') || isHoveringHorizontalTrack
					? 'opacity-100'
					: 'opacity-0'
			)}
			style:right={showVerticalTrack ? `${SCROLLBAR_THICKNESS}px` : '0px'}
			onmouseenter={() => (isHoveringHorizontalTrack = true)}
			onmouseleave={() => (isHoveringHorizontalTrack = false)}
			role="presentation"
		>
			<div
				role="scrollbar"
				aria-controls={viewportId}
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={Math.max(0, viewport ? viewport.scrollWidth - viewport.clientWidth : 0)}
				aria-valuenow={viewport?.scrollLeft ?? 0}
				tabindex="0"
				class={cn(
					'relative h-full rounded-full bg-foreground/10 transition-colors duration-150 hover:bg-foreground/30 active:bg-foreground/50',
					isDragging && dragAxis === 'horizontal' && 'bg-foreground/50'
				)}
				style:width={`${horizontalThumbSize}px`}
				style:transform={`translate3d(${horizontalThumbOffset}px, 0, 0)`}
				onmousedown={(event) => onDragStart(event, 'horizontal')}
				onkeydown={(event) => onThumbKeyDown(event, 'horizontal')}
			></div>
		</div>
	{/if}
</div>

<style>
	.scrollbar-hide {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
