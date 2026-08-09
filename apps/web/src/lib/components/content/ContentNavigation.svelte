<script lang="ts">
	import ContentNavButton from './ContentNavButton.svelte';
	import { contentUiDefaults, type SectionUiConfig } from '$lib/config/content-ui';

	export type ContentNavLink = {
		title: string;
		href: string;
	};

	const {
		previous,
		next,
		paginationConfig = contentUiDefaults.pagination,
		enabled = paginationConfig.enabled
	}: {
		previous?: ContentNavLink | null;
		next?: ContentNavLink | null;
		paginationConfig?: SectionUiConfig['pagination'];
		enabled?: boolean;
	} = $props();
</script>

{#if enabled && (previous ?? next)}
	<nav
		class="relative mt-16 pt-9 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:guide-duotone after:content-['']"
	>
		<div class="grid gap-4 sm:grid-cols-2">
			{#if previous}
				<ContentNavButton label={paginationConfig.previousLabel} {...previous} />
			{/if}

			{#if next}
				<ContentNavButton
					label={paginationConfig.nextLabel}
					align="right"
					forceSecondColumn={!previous}
					{...next}
				/>
			{/if}
		</div>
	</nav>
{/if}
