<script lang="ts">
	import DocNavButton from './DocNavButton.svelte';

	type Link = {
		title: string;
		href: string;
	};

	interface Props {
		previous?: Link | null;
		next?: Link | null;
	}

	let { previous = null, next = null }: Props = $props();
	const nextStartsRight = $derived(!previous && !!next);
</script>

{#if previous || next}
	<nav class="mt-12 border-t border-background-muted/90 pt-8">
		<div class="grid gap-4 sm:grid-cols-2">
			{#if previous}
				<DocNavButton label="Previous" {...previous} />
			{/if}
			{#if next}
				<div class={nextStartsRight ? 'sm:col-start-2' : ''}>
					<DocNavButton label="Next" align="right" {...next} />
				</div>
			{/if}
		</div>
	</nav>
{/if}
