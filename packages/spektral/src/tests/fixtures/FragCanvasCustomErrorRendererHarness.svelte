<script lang="ts">
	import FragCanvas from '../../lib/svelte/FragCanvas.svelte';
	import type { SpektralErrorReport } from '../../lib/core/error-report';
	import type { FragMaterial } from '../../lib/core/material';

	interface Props {
		material: FragMaterial;
		onError?: (report: SpektralErrorReport) => void;
		showErrorOverlay?: boolean;
	}

	let { material, onError = undefined, showErrorOverlay = true }: Props = $props();
</script>

{#snippet customErrorRenderer(report: SpektralErrorReport)}
	<div data-testid="custom-error-renderer">{report.title} :: {report.phase}</div>
{/snippet}

<FragCanvas
	{material}
	{showErrorOverlay}
	errorRenderer={customErrorRenderer}
	{...onError ? { onError } : {}}
/>
