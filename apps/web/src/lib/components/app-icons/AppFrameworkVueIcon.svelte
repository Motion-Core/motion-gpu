<script lang="ts">
	import type { AppHugeIconProps } from './AppHugeIcon.svelte';

	let {
		size = 24,
		strokeWidth = 1.5,
		color = 'currentColor',
		class: className = '',
		...restProps
	}: AppHugeIconProps = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	{...restProps}
>
	<path d="M3 4.5h4.2L12 13l4.8-8.5H21l-9 15.7-9-15.7Z" />
	<path d="M7.5 4.5h3.1L12 7l1.4-2.5h3.1" />
</svg>
