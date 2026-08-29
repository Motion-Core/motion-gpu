<script lang="ts">
	import MotionGPUErrorOverlay from '../../../src/lib/svelte/MotionGPUErrorOverlay.svelte';
	import { errorOverlayStyleReport } from '../../error-overlay-style-report';
	import '../../error-overlay-host-cascade.css';

	let visible = $state(true);
</script>

{#if visible}
	<MotionGPUErrorOverlay report={errorOverlayStyleReport} onDismiss={() => (visible = false)} />
{/if}
