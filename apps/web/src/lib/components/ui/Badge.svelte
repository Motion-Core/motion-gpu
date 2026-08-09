<script lang="ts">
	import type { Snippet } from 'svelte';
	import Shimmer from './Shimmer.svelte';

	type Props = {
		children: Snippet;
	};

	let { children }: Props = $props();
</script>

<div
	data-reveal="badge"
	class="inset-shadow overflow-hidden rounded-full bg-background-inset p-1.5"
>
	<div class="rounded-full bg-background px-2.5 py-0.5 text-sm font-medium tracking-normal card">
		<Shimmer>{@render children()}</Shimmer>
	</div>
</div>
