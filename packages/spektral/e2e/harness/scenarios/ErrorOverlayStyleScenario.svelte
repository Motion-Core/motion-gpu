<script lang="ts">
	import SpektralErrorOverlay from '../../../src/lib/svelte/SpektralErrorOverlay.svelte';
	import { errorOverlayStyleReport } from '../../error-overlay-style-report';
	import '../../error-overlay-host-cascade.css';

	let visible = $state(true);
</script>

{#if visible}
	<SpektralErrorOverlay report={errorOverlayStyleReport} onDismiss={() => (visible = false)} />
{/if}
