<script lang="ts">
	import Portal from '../../lib/svelte/Portal.svelte';

	interface Props {
		target?: string | HTMLElement | null;
	}

	let { target = 'body' }: Props = $props();
</script>

<Portal {target}>
	<span data-testid="portal-content">portal content</span>
</Portal>
