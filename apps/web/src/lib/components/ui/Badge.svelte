<script>
	import Shimmer from './Shimmer.svelte';

	let { children } = $props();
</script>

<div
	class="inset-shadow rounded-full border border-border bg-background-inset px-2.5 py-0.5 text-sm"
>
	<Shimmer>{@render children()}</Shimmer>
</div>
