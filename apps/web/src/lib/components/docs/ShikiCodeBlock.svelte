<script lang="ts">
	import Pre from './markdown/Pre.svelte';

	type Props = {
		code: string;
		htmlLight: string;
		htmlDark?: string;
		lang?: string;
		class?: string;
		unstyled?: boolean;
		scrollable?: boolean;
		scrollThumbTabbable?: boolean;
		scrollViewportTabbable?: boolean;
	};

	let {
		code,
		htmlLight,
		htmlDark,
		lang,
		class: className,
		unstyled = false,
		scrollable,
		scrollThumbTabbable,
		scrollViewportTabbable
	}: Props = $props();
</script>

<Pre
	{code}
	class={className}
	data-language={lang}
	{unstyled}
	{scrollable}
	{scrollThumbTabbable}
	{scrollViewportTabbable}
>
	<div class="shiki-theme-light">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html htmlLight}
	</div>
	<div class="shiki-theme-dark">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html htmlDark ?? htmlLight}
	</div>
</Pre>

<style>
	.shiki-theme-dark {
		display: none;
	}

	:global(.dark) :global(.shiki-theme-light) {
		display: none;
	}

	:global(.dark) :global(.shiki-theme-dark) {
		display: block;
	}
</style>
