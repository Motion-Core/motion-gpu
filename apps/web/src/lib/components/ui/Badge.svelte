<script>
	import Shimmer from './Shimmer.svelte';

	let { children } = $props();
</script>

<div
	data-reveal="badge"
	class="inset-shadow rounded-full bg-background-inset px-2.5 py-0.5 text-sm font-medium tracking-normal"
>
	<Shimmer>{@render children()}</Shimmer>
</div>
