<script lang="ts">
	import FragCanvas from '../../lib/svelte/FragCanvas.svelte';
	import type { SpektralErrorReport } from '../../lib/core/error-report';
	import type { FragMaterial } from '../../lib/core/material';
	import FrameMutationProbe, { type FrameMutationMode } from './FrameMutationProbe.svelte';

	interface Props {
		material: FragMaterial;
		mode?: FrameMutationMode;
		onError?: (report: SpektralErrorReport) => void;
		onErrorHistory?: (history: readonly SpektralErrorReport[]) => void;
		errorHistoryLimit?: number;
		showErrorOverlay?: boolean;
	}

	let {
		material,
		mode = 'none',
		onError = undefined,
		onErrorHistory = undefined,
		errorHistoryLimit = undefined,
		showErrorOverlay = false
	}: Props = $props();
</script>

<FragCanvas
	{material}
	{showErrorOverlay}
	{...onError ? { onError } : {}}
	{...onErrorHistory ? { onErrorHistory } : {}}
	{...errorHistoryLimit !== undefined ? { errorHistoryLimit } : {}}
>
	<FrameMutationProbe {mode} />
</FragCanvas>
